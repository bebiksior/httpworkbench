import { computed, onMounted, ref } from "vue";
import {
  SubscriptionCredentialsSchema,
  type AiSubscriptionProviderId,
  type SubscriptionCredentials,
} from "@/api/domains/ai";

export type AiApiKeyProviderId = "openrouter" | "openai" | "anthropic";
export type AiProviderId = AiApiKeyProviderId | AiSubscriptionProviderId;

type AiApiKeys = Record<AiApiKeyProviderId, string>;
type AiSubscriptions = Partial<
  Record<AiSubscriptionProviderId, SubscriptionCredentials>
>;

const ENABLED_STORAGE_KEY = "httpworkbench.ai.enabled";
const API_KEY_STORAGE_KEYS: Record<AiApiKeyProviderId, string> = {
  openrouter: "httpworkbench_openrouter_key",
  openai: "httpworkbench.ai.openai_key",
  anthropic: "httpworkbench.ai.anthropic_key",
};
const SUBSCRIPTION_STORAGE_KEYS: Record<AiSubscriptionProviderId, string> = {
  chatgpt: "httpworkbench.ai.chatgpt_subscription",
  xai: "httpworkbench.ai.xai_subscription",
};

const readStorage = (key: string) => {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};

export const readAiEnabled = () => readStorage(ENABLED_STORAGE_KEY) !== "false";

export const readAiApiKey = (provider: AiApiKeyProviderId) =>
  readStorage(API_KEY_STORAGE_KEYS[provider]);

export const readSubscriptionCredentials = (
  provider: AiSubscriptionProviderId,
) => {
  const stored = readStorage(SUBSCRIPTION_STORAGE_KEYS[provider]);
  if (stored === undefined) return undefined;
  try {
    const result = SubscriptionCredentialsSchema.safeParse(JSON.parse(stored));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
};

const readApiKeys = (): AiApiKeys => ({
  openrouter: readAiApiKey("openrouter") ?? "",
  openai: readAiApiKey("openai") ?? "",
  anthropic: readAiApiKey("anthropic") ?? "",
});

const readSubscriptions = (): AiSubscriptions => ({
  chatgpt: readSubscriptionCredentials("chatgpt"),
  xai: readSubscriptionCredentials("xai"),
});

const aiEnabled = ref(readAiEnabled());
const aiApiKeys = ref(readApiKeys());
const aiSubscriptions = ref(readSubscriptions());
let hasStorageListener = false;

const syncFromStorage = () => {
  aiEnabled.value = readAiEnabled();
  aiApiKeys.value = readApiKeys();
  aiSubscriptions.value = readSubscriptions();
};

const mutateStorage = (mutation: (storage: Storage) => void) => {
  try {
    mutation(window.localStorage);
    syncFromStorage();
    return true;
  } catch {
    return false;
  }
};

export const setAiEnabled = (value: boolean) =>
  mutateStorage((storage) => {
    storage.setItem(ENABLED_STORAGE_KEY, value ? "true" : "false");
  });

export const saveAiApiKey = (provider: AiApiKeyProviderId, value: string) =>
  mutateStorage((storage) => {
    storage.setItem(API_KEY_STORAGE_KEYS[provider], value);
  });

export const clearAiApiKey = (provider: AiApiKeyProviderId) =>
  mutateStorage((storage) => {
    storage.removeItem(API_KEY_STORAGE_KEYS[provider]);
  });

export const saveSubscriptionCredentials = (
  provider: AiSubscriptionProviderId,
  credentials: SubscriptionCredentials,
) =>
  mutateStorage((storage) => {
    storage.setItem(
      SUBSCRIPTION_STORAGE_KEYS[provider],
      JSON.stringify(SubscriptionCredentialsSchema.parse(credentials)),
    );
  });

export const clearSubscriptionCredentials = (
  provider: AiSubscriptionProviderId,
) =>
  mutateStorage((storage) => {
    storage.removeItem(SUBSCRIPTION_STORAGE_KEYS[provider]);
  });

const hasConfiguredValue = (value: string | undefined) =>
  value !== undefined && value.trim() !== "";

export const useAiSettings = () => {
  onMounted(() => {
    syncFromStorage();
    if (!hasStorageListener) {
      window.addEventListener("storage", syncFromStorage);
      hasStorageListener = true;
    }
  });

  const isProviderConfigured = (provider: AiProviderId) => {
    if (provider === "chatgpt" || provider === "xai") {
      return aiSubscriptions.value[provider] !== undefined;
    }
    return hasConfiguredValue(aiApiKeys.value[provider]);
  };

  return {
    isEnabled: computed(() => aiEnabled.value),
    apiKeys: computed(() => aiApiKeys.value),
    subscriptions: computed(() => aiSubscriptions.value),
    hasConfiguredProvider: computed(() =>
      (
        [
          "openrouter",
          "openai",
          "anthropic",
          "chatgpt",
          "xai",
        ] satisfies AiProviderId[]
      ).some(isProviderConfigured),
    ),
    isProviderConfigured,
  };
};
