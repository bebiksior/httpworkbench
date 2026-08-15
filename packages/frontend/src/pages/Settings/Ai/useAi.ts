import { useConfirm } from "primevue/useconfirm";
import { computed, onBeforeUnmount, ref } from "vue";
import {
  aiApi,
  type AiSubscriptionProviderId,
  type DeviceAuthorization,
  type DeviceAuthorizationPoll,
} from "@/api/domains/ai";
import { useNotify } from "@/composables";
import { useAgentsStore } from "@/stores";
import { getErrorMessage } from "@/utils/error";
import {
  clearAiApiKey,
  clearSubscriptionCredentials,
  saveAiApiKey,
  saveSubscriptionCredentials,
  setAiEnabled,
  useAiSettings,
} from "@/utils/ai";
import type { AiApiKeyProvider, AiSubscriptionProvider } from "./providers";

const STORAGE_ERROR = "Browser storage is unavailable, so nothing was saved";

export type SubscriptionConnectionState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "waiting"; authorization: DeviceAuthorization }
  | { kind: "error"; message: string };

const delay = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });

const toPollRequest = (
  authorization: DeviceAuthorization,
): DeviceAuthorizationPoll =>
  authorization.kind === "chatgpt"
    ? {
        kind: "chatgpt",
        deviceAuthId: authorization.deviceAuthId,
        userCode: authorization.userCode,
      }
    : { kind: "xai", deviceCode: authorization.deviceCode };

export const useAi = () => {
  const { isEnabled, apiKeys, subscriptions } = useAiSettings();
  const confirm = useConfirm();
  const notify = useNotify();
  const agentsStore = useAgentsStore();
  const connectionStates = ref<
    Record<AiSubscriptionProviderId, SubscriptionConnectionState>
  >({
    chatgpt: { kind: "idle" },
    xai: { kind: "idle" },
  });
  const connectionControllers = new Map<
    AiSubscriptionProviderId,
    AbortController
  >();

  const setConnectionState = (
    provider: AiSubscriptionProviderId,
    state: SubscriptionConnectionState,
  ) => {
    connectionStates.value = { ...connectionStates.value, [provider]: state };
  };

  const confirmCredentialRemoval = ({
    header,
    message,
    label,
    successMessage,
    remove,
  }: {
    header: string;
    message: string;
    label: string;
    successMessage: string;
    remove: () => boolean;
  }) => {
    confirm.require({
      header,
      message,
      icon: "pi pi-exclamation-triangle",
      rejectProps: {
        label: "Cancel",
        severity: "secondary",
        outlined: true,
      },
      acceptProps: { label, severity: "danger" },
      accept: () => {
        if (!remove()) {
          notify.error(STORAGE_ERROR);
          return;
        }
        notify.success(successMessage);
      },
    });
  };

  const saveKey = (provider: AiApiKeyProvider, value: string) => {
    const trimmed = value.trim();
    if (trimmed === "") return;
    if (!saveAiApiKey(provider.id, trimmed)) {
      notify.error(STORAGE_ERROR);
      return;
    }
    notify.success(`${provider.name} key saved`);
  };

  const removeKey = (provider: AiApiKeyProvider) => {
    confirmCredentialRemoval({
      header: `Remove ${provider.name} key`,
      message: `Remove the ${provider.name} API key from this browser?`,
      label: "Remove",
      successMessage: `${provider.name} key removed`,
      remove: () => clearAiApiKey(provider.id),
    });
  };

  const cancelConnection = (provider: AiSubscriptionProviderId) => {
    connectionControllers.get(provider)?.abort();
    connectionControllers.delete(provider);
    setConnectionState(provider, { kind: "idle" });
  };

  const aiEnabled = computed({
    get: () => isEnabled.value,
    set: (value: boolean) => {
      if (!setAiEnabled(value)) {
        notify.error(STORAGE_ERROR);
        return;
      }
      if (!value) {
        agentsStore.abortAgent();
        for (const provider of [...connectionControllers.keys()]) {
          cancelConnection(provider);
        }
      }
    },
  });

  const connectSubscription = async (provider: AiSubscriptionProvider) => {
    cancelConnection(provider.id);
    const controller = new AbortController();
    connectionControllers.set(provider.id, controller);
    setConnectionState(provider.id, { kind: "starting" });

    try {
      const authorization = await aiApi.requestDeviceAuthorization(
        provider.id,
        controller.signal,
      );
      setConnectionState(provider.id, { kind: "waiting", authorization });
      let interval = Math.max(authorization.interval, 1);

      while (Date.now() < authorization.expiresAt) {
        await delay(interval * 1000, controller.signal);
        const result = await aiApi.pollDeviceAuthorization(
          toPollRequest(authorization),
          controller.signal,
        );
        if (result.kind === "connected") {
          if (!saveSubscriptionCredentials(provider.id, result.credentials)) {
            throw new Error(STORAGE_ERROR);
          }
          setConnectionState(provider.id, { kind: "idle" });
          notify.success(`${provider.name} connected`);
          return;
        }
        if (result.interval !== undefined) {
          interval = Math.max(result.interval, 1);
        } else if (result.slowDown === true) {
          interval += 5;
        }
      }
      throw new Error(`${provider.name} sign-in code expired`);
    } catch (error) {
      if (!controller.signal.aborted) {
        setConnectionState(provider.id, {
          kind: "error",
          message: getErrorMessage(error),
        });
      }
    } finally {
      if (connectionControllers.get(provider.id) === controller) {
        connectionControllers.delete(provider.id);
      }
    }
  };

  const disconnectSubscription = (provider: AiSubscriptionProvider) => {
    confirmCredentialRemoval({
      header: `Disconnect ${provider.name}`,
      message: `Remove the stored ${provider.name} credentials from this browser?`,
      label: "Disconnect",
      successMessage: `${provider.name} disconnected`,
      remove: () => {
        cancelConnection(provider.id);
        return clearSubscriptionCredentials(provider.id);
      },
    });
  };

  onBeforeUnmount(() => {
    for (const controller of connectionControllers.values()) {
      controller.abort();
    }
    connectionControllers.clear();
  });

  return {
    aiEnabled,
    apiKeys,
    subscriptions,
    connectionStates,
    saveKey,
    removeKey,
    connectSubscription,
    cancelConnection,
    disconnectSubscription,
  };
};
