import { type Log, LogSchema } from "shared";
import {
  computed,
  type MaybeRefOrGetter,
  onBeforeUnmount,
  ref,
  toValue,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import { useNotify } from "@/composables";
import { useInstanceDetail } from "@/queries/domains/useInstanceDetail";
import { isPresent } from "@/utils/types";

export const useInstanceDetailLogic = (
  instanceId: MaybeRefOrGetter<string>,
) => {
  const router = useRouter();
  const notify = useNotify();
  const resolvedInstanceId = computed(() => toValue(instanceId));
  const streamLogs = ref<Log[]>([]);
  const streamConnection = ref<WebSocket | undefined>(undefined);

  const { data, isLoading, error } = useInstanceDetail(instanceId);

  watch(
    () => data.value?.logs,
    (fetchedLogs) => {
      streamLogs.value = fetchedLogs ?? [];
    },
    { immediate: true },
  );

  const closeStream = () => {
    if (isPresent(streamConnection.value)) {
      streamConnection.value.close();
      streamConnection.value = undefined;
    }
  };

  const handleMessage = (message: MessageEvent) => {
    if (typeof message.data !== "string") {
      return;
    }

    try {
      const parsed = LogSchema.safeParse(JSON.parse(message.data));
      if (!parsed.success) {
        return;
      }

      const exists = streamLogs.value.some(
        (entry) => entry.id === parsed.data.id,
      );
      if (exists) {
        return;
      }
      streamLogs.value = [...streamLogs.value, parsed.data];
    } catch {}
  };

  const openStream = (id: string) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/instances/${id}/stream`,
    );
    ws.onmessage = handleMessage;
    ws.onclose = () => {
      streamConnection.value = undefined;
    };

    streamConnection.value = ws;
  };

  watch(
    resolvedInstanceId,
    (newId) => {
      closeStream();
      if (newId === undefined || newId === "") {
        streamLogs.value = [];
        return;
      }

      openStream(newId);
    },
    { immediate: true },
  );

  watch(error, (newError) => {
    if (isPresent(newError)) {
      notify.error("Error loading instance", newError);
      router.push("/");
    }
  });

  onBeforeUnmount(() => {
    closeStream();
  });

  return {
    instance: computed(() => data.value?.instance),
    logs: computed(() => [...streamLogs.value].reverse()),
    isLoading,
    error,
  };
};
