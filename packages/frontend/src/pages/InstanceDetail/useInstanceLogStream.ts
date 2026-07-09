import { type InstanceDetailResponse, type Log, LogSchema } from "shared";
import {
  computed,
  type MaybeRefOrGetter,
  onBeforeUnmount,
  ref,
  toValue,
  watch,
} from "vue";
import { apiPaths } from "@/api/paths";

const STREAM_OPEN_TIMEOUT_MS = 10_000;
const STREAM_HEARTBEAT_INTERVAL_MS = 10_000;
const STREAM_HEARTBEAT_TIMEOUT_MS = 25_000;

export const parseStreamLog = (data: unknown): Log | undefined => {
  if (typeof data !== "string" || data === "pong") {
    return undefined;
  }
  try {
    const parsed = LogSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const appendUniqueLog = (logs: readonly Log[], log: Log): Log[] =>
  logs.some((entry) => entry.id === log.id) ? [...logs] : [...logs, log];

export const useInstanceLogStream = (
  instanceId: MaybeRefOrGetter<string>,
  detail: MaybeRefOrGetter<InstanceDetailResponse | undefined>,
  refetch: () => unknown,
) => {
  const resolvedInstanceId = computed(() => toValue(instanceId));
  const streamLogs = ref<Log[]>([]);

  let connection: WebSocket | undefined;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  let openTimeout: ReturnType<typeof setTimeout> | undefined;
  let healthInterval: ReturnType<typeof setInterval> | undefined;
  let resyncInterval: ReturnType<typeof setInterval> | undefined;
  let reconnectAttempt = 0;
  let generation = 0;
  let lastHeartbeatAt = 0;
  let lastPingSentAt: number | undefined;

  const isStale = (id: string, expectedGeneration: number, ws?: WebSocket) =>
    generation !== expectedGeneration ||
    resolvedInstanceId.value !== id ||
    (ws !== undefined && connection !== ws);

  const clearReconnect = () => {
    if (reconnectTimeout !== undefined) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = undefined;
    }
  };

  const clearOpenTimeout = () => {
    if (openTimeout !== undefined) {
      clearTimeout(openTimeout);
      openTimeout = undefined;
    }
  };

  const closeConnection = () => {
    clearReconnect();
    clearOpenTimeout();
    if (connection !== undefined) {
      connection.onopen = null;
      connection.onmessage = null;
      connection.onerror = null;
      connection.onclose = null;
      connection.close();
      connection = undefined;
    }
    lastPingSentAt = undefined;
  };

  const sendHeartbeat = (
    ws: WebSocket,
    id: string,
    expectedGeneration: number,
  ) => {
    if (
      isStale(id, expectedGeneration, ws) ||
      ws.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    lastPingSentAt = Date.now();
    ws.send("ping");
  };

  const openStream = (id: string) => {
    clearReconnect();
    clearOpenTimeout();
    const expectedGeneration = generation;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}${apiPaths.instanceStream(id)}`,
    );
    connection = ws;
    lastHeartbeatAt = Date.now();
    lastPingSentAt = undefined;

    const reconnect = () => {
      if (isStale(id, expectedGeneration, ws)) {
        return;
      }
      closeConnection();
      openStream(id);
    };

    openTimeout = setTimeout(() => {
      openTimeout = undefined;
      if (
        !isStale(id, expectedGeneration, ws) &&
        ws.readyState === WebSocket.CONNECTING
      ) {
        reconnect();
      }
    }, STREAM_OPEN_TIMEOUT_MS);

    ws.onopen = () => {
      if (isStale(id, expectedGeneration, ws)) {
        ws.close();
        return;
      }
      clearOpenTimeout();
      reconnectAttempt = 0;
      lastHeartbeatAt = Date.now();
      sendHeartbeat(ws, id, expectedGeneration);
      void refetch();
    };
    ws.onmessage = (message) => {
      if (isStale(id, expectedGeneration, ws)) {
        ws.close();
        return;
      }
      lastHeartbeatAt = Date.now();
      lastPingSentAt = undefined;
      const log = parseStreamLog(message.data);
      if (log !== undefined) {
        streamLogs.value = appendUniqueLog(streamLogs.value, log);
      }
    };
    ws.onerror = () => {
      if (!isStale(id, expectedGeneration, ws)) {
        ws.close();
      }
    };
    ws.onclose = () => {
      if (isStale(id, expectedGeneration, ws)) {
        return;
      }
      clearOpenTimeout();
      connection = undefined;
      lastPingSentAt = undefined;
      if (reconnectTimeout !== undefined || id === "") {
        return;
      }
      const delay = Math.min(10_000, 250 * 2 ** Math.min(reconnectAttempt, 6));
      reconnectAttempt += 1;
      reconnectTimeout = setTimeout(
        () => {
          reconnectTimeout = undefined;
          if (!isStale(id, expectedGeneration)) {
            openStream(id);
          }
        },
        Math.round(delay * (0.8 + Math.random() * 0.4)),
      );
    };
  };

  watch(
    resolvedInstanceId,
    (id) => {
      generation += 1;
      reconnectAttempt = 0;
      closeConnection();
      streamLogs.value = [];
      if (id !== "") {
        openStream(id);
      }
    },
    { immediate: true },
  );

  watch(
    () => toValue(detail),
    (value) => {
      if (value?.instance.id === resolvedInstanceId.value) {
        streamLogs.value = value.logs;
      }
    },
    { immediate: true },
  );

  healthInterval = setInterval(() => {
    const id = resolvedInstanceId.value;
    if (id === "") return;
    if (connection === undefined) {
      openStream(id);
      return;
    }
    if (
      connection.readyState === WebSocket.CLOSING ||
      connection.readyState === WebSocket.CLOSED
    ) {
      closeConnection();
      openStream(id);
      return;
    }
    if (connection.readyState !== WebSocket.OPEN) return;

    const now = Date.now();
    if (
      lastPingSentAt !== undefined &&
      now - lastPingSentAt > STREAM_HEARTBEAT_TIMEOUT_MS
    ) {
      closeConnection();
      openStream(id);
    } else if (
      lastPingSentAt === undefined &&
      now - lastHeartbeatAt >= STREAM_HEARTBEAT_INTERVAL_MS
    ) {
      sendHeartbeat(connection, id, generation);
    }
  }, STREAM_HEARTBEAT_INTERVAL_MS);

  const onVisibilityChange = () => {
    if (
      document.visibilityState !== "visible" ||
      resolvedInstanceId.value === ""
    ) {
      return;
    }
    void refetch();
    if (connection === undefined) {
      openStream(resolvedInstanceId.value);
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  resyncInterval = setInterval(() => {
    if (
      document.visibilityState === "visible" &&
      resolvedInstanceId.value !== ""
    ) {
      void refetch();
    }
  }, 15_000);

  onBeforeUnmount(() => {
    generation += 1;
    if (healthInterval !== undefined) clearInterval(healthInterval);
    if (resyncInterval !== undefined) clearInterval(resyncInterval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    closeConnection();
  });

  return computed(() => [...streamLogs.value].reverse());
};
