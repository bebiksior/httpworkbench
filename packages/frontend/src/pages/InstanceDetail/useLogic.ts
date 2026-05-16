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
import { NotFoundError } from "@/api/errors";
import { useNotify } from "@/composables";
import { useInstanceDetail } from "@/queries/domains/useInstanceDetail";
import { useAuthStore } from "@/stores";
import { isPresent } from "@/utils/types";

const STREAM_OPEN_TIMEOUT_MS = 10_000;
const STREAM_HEARTBEAT_INTERVAL_MS = 10_000;
const STREAM_HEARTBEAT_TIMEOUT_MS = 25_000;

export const useInstanceDetailLogic = (
  instanceId: MaybeRefOrGetter<string>,
) => {
  const router = useRouter();
  const notify = useNotify();
  const authStore = useAuthStore();
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
  const streamHealthInterval = ref<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const streamOpenTimeout = ref<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastHeartbeatAt = ref(0);
  const lastPingSentAt = ref<number | undefined>(undefined);

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

  const clearOpenTimeout = () => {
    if (streamOpenTimeout.value !== undefined) {
      clearTimeout(streamOpenTimeout.value);
      streamOpenTimeout.value = undefined;
    }
  };

  const clearHealthCheck = () => {
    if (streamHealthInterval.value !== undefined) {
      clearInterval(streamHealthInterval.value);
      streamHealthInterval.value = undefined;
    }
  };

  const closeStream = () => {
    clearReconnect();
    clearOpenTimeout();
    if (isPresent(streamConnection.value)) {
      streamConnection.value.onopen = null;
      streamConnection.value.onmessage = null;
      streamConnection.value.onerror = null;
      streamConnection.value.onclose = null;
      streamConnection.value.close();
      streamConnection.value = undefined;
    }
    lastPingSentAt.value = undefined;
  };

  const handleMessage = (message: MessageEvent) => {
    if (typeof message.data !== "string") {
      return;
    }
    lastHeartbeatAt.value = Date.now();
    lastPingSentAt.value = undefined;
    if (message.data === "pong") {
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

  const reconnectStream = (id: string, generation: number) => {
    if (connectionGeneration.value !== generation) {
      return;
    }
    if (resolvedInstanceId.value !== id) {
      return;
    }
    closeStream();
    openStream(id);
  };

  const sendHeartbeat = (ws: WebSocket, id: string, generation: number) => {
    if (connectionGeneration.value !== generation) {
      return;
    }
    if (resolvedInstanceId.value !== id) {
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    lastPingSentAt.value = Date.now();
    ws.send("ping");
  };

  const openStream = (id: string) => {
    clearReconnect();
    clearOpenTimeout();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const generation = connectionGeneration.value;
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/instances/${id}/stream`,
    );
    lastHeartbeatAt.value = Date.now();
    lastPingSentAt.value = undefined;
    streamOpenTimeout.value = setTimeout(() => {
      streamOpenTimeout.value = undefined;
      if (connectionGeneration.value !== generation) {
        return;
      }
      if (resolvedInstanceId.value !== id) {
        return;
      }
      if (streamConnection.value !== ws) {
        return;
      }
      if (ws.readyState !== WebSocket.CONNECTING) {
        return;
      }
      reconnectStream(id, generation);
    }, STREAM_OPEN_TIMEOUT_MS);
    ws.onopen = () => {
      if (connectionGeneration.value !== generation) {
        ws.close();
        return;
      }
      clearOpenTimeout();
      lastHeartbeatAt.value = Date.now();
      lastPingSentAt.value = undefined;
      reconnectAttempt.value = 0;
      sendHeartbeat(ws, id, generation);
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
      clearOpenTimeout();
      lastPingSentAt.value = undefined;
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

  if (streamHealthInterval.value === undefined) {
    streamHealthInterval.value = setInterval(() => {
      const id = resolvedInstanceId.value;
      if (id === "") {
        return;
      }
      const ws = streamConnection.value;
      if (ws === undefined) {
        openStream(id);
        return;
      }
      if (
        ws.readyState === WebSocket.CLOSING ||
        ws.readyState === WebSocket.CLOSED
      ) {
        reconnectStream(id, connectionGeneration.value);
        return;
      }
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const lastPingAt = lastPingSentAt.value;
      const now = Date.now();
      if (
        lastPingAt !== undefined &&
        now - lastPingAt > STREAM_HEARTBEAT_TIMEOUT_MS
      ) {
        reconnectStream(id, connectionGeneration.value);
        return;
      }
      if (
        lastPingAt === undefined &&
        now - lastHeartbeatAt.value >= STREAM_HEARTBEAT_INTERVAL_MS
      ) {
        sendHeartbeat(ws, id, connectionGeneration.value);
      }
    }, STREAM_HEARTBEAT_INTERVAL_MS);
  }

  watch(error, (newError) => {
    if (isPresent(newError)) {
      if (newError instanceof NotFoundError) {
        router.replace({ name: "notFound" });
        return;
      }
      notify.error("Error loading instance", newError);
      if (authStore.hasSession) {
        router.push({ name: "home" });
        return;
      }
      router.push({ name: "login" });
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
    clearHealthCheck();
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
