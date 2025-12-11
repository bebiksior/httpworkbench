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
  const reconnectTimeout = ref<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const reconnectAttempt = ref(0);
  const connectionGeneration = ref(0);
  const resyncInterval = ref<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  const { data, isLoading, error, refetch } = useInstanceDetail(instanceId);

  watch(
    data,
    (newData) => {
      streamLogs.value = newData?.logs ?? [];
    },
    { immediate: true },
  );

  const clearReconnect = () => {
    if (reconnectTimeout.value !== undefined) {
      clearTimeout(reconnectTimeout.value);
      reconnectTimeout.value = undefined;
    }
  };

  const closeStream = () => {
    clearReconnect();
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

  const scheduleReconnect = (id: string, generation: number) => {
    if (reconnectTimeout.value !== undefined) {
      return;
    }
    if (id === "") {
      return;
    }

    const attempt = reconnectAttempt.value;
    const exponential = 250 * Math.pow(2, Math.min(attempt, 6));
    const delay = Math.min(10_000, exponential);
    const jitteredDelay = Math.round(delay * (0.8 + Math.random() * 0.4));

    reconnectAttempt.value = attempt + 1;
    reconnectTimeout.value = setTimeout(() => {
      reconnectTimeout.value = undefined;
      if (connectionGeneration.value !== generation) {
        return;
      }
      if (resolvedInstanceId.value !== id) {
        return;
      }
      openStream(id);
    }, jitteredDelay);
  };

  const openStream = (id: string) => {
    clearReconnect();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const generation = connectionGeneration.value;
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/instances/${id}/stream`,
    );
    ws.onopen = () => {
      if (connectionGeneration.value !== generation) {
        ws.close();
        return;
      }
      reconnectAttempt.value = 0;
      void refetch();
    };
    ws.onmessage = (message) => {
      if (connectionGeneration.value !== generation) {
        ws.close();
        return;
      }
      handleMessage(message);
    };
    ws.onerror = () => {
      if (connectionGeneration.value !== generation) {
        ws.close();
        return;
      }
      ws.close();
    };
    ws.onclose = () => {
      if (connectionGeneration.value !== generation) {
        return;
      }
      streamConnection.value = undefined;
      scheduleReconnect(id, generation);
    };

    streamConnection.value = ws;
  };

  watch(
    resolvedInstanceId,
    (newId) => {
      connectionGeneration.value += 1;
      reconnectAttempt.value = 0;
      closeStream();
      if (newId === "") {
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

  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    const id = resolvedInstanceId.value;
    if (id === "") {
      return;
    }
    void refetch();
    if (streamConnection.value === undefined) {
      openStream(id);
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);

  onBeforeUnmount(() => {
    connectionGeneration.value += 1;
    if (resyncInterval.value !== undefined) {
      clearInterval(resyncInterval.value);
      resyncInterval.value = undefined;
    }
    document.removeEventListener("visibilitychange", onVisibilityChange);
    closeStream();
  });

  if (resyncInterval.value === undefined) {
    resyncInterval.value = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (resolvedInstanceId.value === "") {
        return;
      }
      void refetch();
    }, 15_000);
  }

  return {
    instance: computed(() => data.value?.instance),
    logs: computed(() => [...streamLogs.value].reverse()),
    isLoading,
    error,
  };
};
