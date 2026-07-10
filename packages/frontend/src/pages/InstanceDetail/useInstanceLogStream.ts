import { type InstanceDetailResponse, type Log, LogSchema } from "shared";
import {
  computed,
  type MaybeRefOrGetter,
  nextTick,
  onBeforeUnmount,
  ref,
  toValue,
  watch,
} from "vue";
import { apiPaths } from "@/api/paths";

const STREAM_OPEN_TIMEOUT_MS = 10_000;
const STREAM_HEARTBEAT_INTERVAL_MS = 10_000;
const STREAM_HEARTBEAT_TIMEOUT_MS = 25_000;
export const MAX_RETAINED_LOGS = 500;

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

export const useInstanceLogStream = (
  instanceId: MaybeRefOrGetter<string>,
  detail: MaybeRefOrGetter<InstanceDetailResponse | undefined>,
  refetch: () => unknown,
) => {
  const resolvedInstanceId = computed(() => toValue(instanceId));
  // Logs are kept newest-first so consumers do not need to reverse and copy the
  // complete collection after every streamed event.
  const streamLogs = ref<Log[]>([]);
  const logIds = new Set<string>();

  let connection: WebSocket | undefined;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  let openTimeout: ReturnType<typeof setTimeout> | undefined;
  let healthInterval: ReturnType<typeof setInterval> | undefined;
  let reconnectAttempt = 0;
  let generation = 0;
  let lastHeartbeatAt = 0;
  let lastPingSentAt: number | undefined;
  let resyncState:
    | { generation: number; logs: Log[]; promise: Promise<void> }
    | undefined;

  const replaceLogs = (logs: readonly Log[]) => {
    logIds.clear();
    const next: Log[] = [];
    for (let index = logs.length - 1; index >= 0; index -= 1) {
      const log = logs[index];
      if (log === undefined || logIds.has(log.id)) {
        continue;
      }
      logIds.add(log.id);
      next.push(log);
      if (next.length === MAX_RETAINED_LOGS) {
        break;
      }
    }
    streamLogs.value = next;
  };

  const prependLog = (log: Log) => {
    if (logIds.has(log.id)) {
      return;
    }
    logIds.add(log.id);
    const next = [log, ...streamLogs.value];
    if (next.length > MAX_RETAINED_LOGS) {
      const removed = next.pop();
      if (removed !== undefined) {
        logIds.delete(removed.id);
      }
    }
    streamLogs.value = next;
  };

  const resyncLogs = () => {
    if (resyncState?.generation === generation) {
      return resyncState.promise;
    }

    const state = {
      generation,
      logs: [] as Log[],
      promise: Promise.resolve(),
    };
    state.promise = (async () => {
      try {
        await refetch();
        await nextTick();
      } finally {
        if (generation === state.generation) {
          for (const log of state.logs) {
            prependLog(log);
          }
        }
        if (resyncState === state) {
          resyncState = undefined;
        }
      }
    })();
    resyncState = state;
    return state.promise;
  };

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

    ws.onopen = async () => {
      if (isStale(id, expectedGeneration, ws)) {
        ws.close();
        return;
      }
      clearOpenTimeout();
      reconnectAttempt = 0;
      lastHeartbeatAt = Date.now();
      sendHeartbeat(ws, id, expectedGeneration);
      await resyncLogs();
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
        if (resyncState?.generation === expectedGeneration) {
          resyncState.logs.push(log);
        }
        prependLog(log);
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
      replaceLogs([]);
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
        replaceLogs(value.logs);
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

  const onVisibilityChange = async () => {
    if (
      document.visibilityState !== "visible" ||
      resolvedInstanceId.value === ""
    ) {
      return;
    }
    await resyncLogs();
    if (connection === undefined) {
      openStream(resolvedInstanceId.value);
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  onBeforeUnmount(() => {
    generation += 1;
    if (healthInterval !== undefined) clearInterval(healthInterval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    closeConnection();
  });

  return computed(() => streamLogs.value);
};
