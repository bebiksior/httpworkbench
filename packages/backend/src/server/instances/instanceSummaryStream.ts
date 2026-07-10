import type {
  InstanceLogCount,
  InstanceSummaryStreamServerMessage,
} from "shared";

export interface InstanceSummaryStreamSocket {
  send(data: string): unknown;
  readonly readyState: number;
  getBufferedAmount?: () => number;
  close?: (code?: number, reason?: string) => unknown;
}

type SubscriberState = {
  counts: Map<string, number>;
  generation: number;
  pendingInstanceIds: Set<string>;
  pendingRemovedInstanceIds: Set<string>;
  sequence: number;
};

type InstanceSummaryStreamOptions = {
  flushIntervalMs?: number;
  maxSocketBufferedBytes?: number;
};

const streamEncoder = new TextEncoder();

export const createInstanceSummaryStreamBroker = (
  options: InstanceSummaryStreamOptions = {},
) => {
  const flushIntervalMs = options.flushIntervalMs ?? 150;
  const maxSocketBufferedBytes = options.maxSocketBufferedBytes ?? 1024 * 1024;
  const subscribersByInstanceId = new Map<
    string,
    Set<InstanceSummaryStreamSocket>
  >();
  const statesBySocket = new Map<
    InstanceSummaryStreamSocket,
    SubscriberState
  >();
  const authoritativeCountsByInstanceId = new Map<string, number>();
  const dirtyInstanceIds = new Set<string>();
  const removedInstanceIds = new Set<string>();
  const dirtySockets = new Set<InstanceSummaryStreamSocket>();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const closeSlowSocket = (socket: InstanceSummaryStreamSocket) => {
    try {
      socket.close?.(1013, "Instance summary stream client is too slow");
    } catch {
      // The socket may already be closed.
    }
  };

  const removeSocket = (socket: InstanceSummaryStreamSocket) => {
    const state = statesBySocket.get(socket);
    if (state !== undefined) {
      for (const instanceId of state.counts.keys()) {
        const subscribers = subscribersByInstanceId.get(instanceId);
        subscribers?.delete(socket);
        if (subscribers?.size === 0) {
          subscribersByInstanceId.delete(instanceId);
          authoritativeCountsByInstanceId.delete(instanceId);
          dirtyInstanceIds.delete(instanceId);
          removedInstanceIds.delete(instanceId);
        }
      }
    }
    statesBySocket.delete(socket);
    dirtySockets.delete(socket);
  };

  const sendMessage = (
    socket: InstanceSummaryStreamSocket,
    message: InstanceSummaryStreamServerMessage,
  ) => {
    if (socket.readyState !== 1) {
      removeSocket(socket);
      return false;
    }
    const payload = JSON.stringify(message);
    const payloadBytes = streamEncoder.encode(payload).byteLength;
    let bufferedBytes = 0;
    try {
      bufferedBytes = socket.getBufferedAmount?.() ?? 0;
    } catch {
      closeSlowSocket(socket);
      removeSocket(socket);
      return false;
    }
    if (payloadBytes + bufferedBytes > maxSocketBufferedBytes) {
      closeSlowSocket(socket);
      removeSocket(socket);
      return false;
    }
    try {
      socket.send(payload);
      return true;
    } catch {
      closeSlowSocket(socket);
      removeSocket(socket);
      return false;
    }
  };

  const flush = () => {
    if (flushTimer !== undefined) {
      clearTimeout(flushTimer);
    }
    flushTimer = undefined;

    for (const instanceId of dirtyInstanceIds) {
      const subscribers = subscribersByInstanceId.get(instanceId);
      if (subscribers === undefined) {
        continue;
      }
      const removed = removedInstanceIds.has(instanceId);
      const count = authoritativeCountsByInstanceId.get(instanceId);
      if (removed) {
        subscribersByInstanceId.delete(instanceId);
      }
      for (const socket of [...subscribers]) {
        const state = statesBySocket.get(socket);
        if (state?.counts.has(instanceId) !== true) {
          subscribers.delete(socket);
          continue;
        }
        if (removed) {
          state.counts.delete(instanceId);
          state.pendingInstanceIds.delete(instanceId);
          state.pendingRemovedInstanceIds.add(instanceId);
        } else if (count !== undefined) {
          state.counts.set(instanceId, count);
          state.pendingRemovedInstanceIds.delete(instanceId);
          state.pendingInstanceIds.add(instanceId);
        }
        dirtySockets.add(socket);
      }
    }
    dirtyInstanceIds.clear();
    removedInstanceIds.clear();

    const sockets = [...dirtySockets];
    dirtySockets.clear();
    for (const socket of sockets) {
      const state = statesBySocket.get(socket);
      if (state === undefined) {
        continue;
      }
      const counts: InstanceLogCount[] = [];
      for (const instanceId of state.pendingInstanceIds) {
        const count = state.counts.get(instanceId);
        if (count !== undefined) {
          counts.push({ instanceId, count });
        }
      }
      const removedInstanceIds = [...state.pendingRemovedInstanceIds];
      state.pendingInstanceIds.clear();
      state.pendingRemovedInstanceIds.clear();
      if (counts.length === 0 && removedInstanceIds.length === 0) {
        continue;
      }
      state.sequence += 1;
      sendMessage(socket, {
        type: "counts",
        generation: state.generation,
        sequence: state.sequence,
        counts,
        removedInstanceIds,
      });
    }
  };

  const scheduleFlush = () => {
    if (flushTimer === undefined) {
      flushTimer = setTimeout(flush, flushIntervalMs);
    }
  };

  const replaceSubscriptions = (
    socket: InstanceSummaryStreamSocket,
    counts: readonly InstanceLogCount[],
    generation: number,
  ) => {
    removeSocket(socket);
    const state: SubscriberState = {
      counts: new Map(
        counts.map(({ instanceId, count }) => [instanceId, count]),
      ),
      generation,
      pendingInstanceIds: new Set(),
      pendingRemovedInstanceIds: new Set(),
      sequence: 1,
    };
    statesBySocket.set(socket, state);
    for (const [instanceId, count] of state.counts) {
      authoritativeCountsByInstanceId.set(instanceId, count);
      let subscribers = subscribersByInstanceId.get(instanceId);
      if (subscribers === undefined) {
        subscribers = new Set();
        subscribersByInstanceId.set(instanceId, subscribers);
      }
      subscribers.add(socket);
    }
    sendMessage(socket, {
      type: "snapshot",
      generation: state.generation,
      sequence: state.sequence,
      counts: counts.map(({ instanceId, count }) => ({ instanceId, count })),
    });
  };

  const recordLogAdded = (instanceId: string) => {
    const subscribers = subscribersByInstanceId.get(instanceId);
    const current = authoritativeCountsByInstanceId.get(instanceId);
    if (
      subscribers === undefined ||
      current === undefined ||
      removedInstanceIds.has(instanceId)
    ) {
      return;
    }
    authoritativeCountsByInstanceId.set(instanceId, current + 1);
    dirtyInstanceIds.add(instanceId);
    scheduleFlush();
  };

  const recordLogsCleared = (instanceId: string) => {
    const subscribers = subscribersByInstanceId.get(instanceId);
    if (subscribers === undefined || removedInstanceIds.has(instanceId)) {
      return;
    }
    authoritativeCountsByInstanceId.set(instanceId, 0);
    dirtyInstanceIds.add(instanceId);
    scheduleFlush();
  };

  const recordInstanceRemoved = (instanceId: string) => {
    const subscribers = subscribersByInstanceId.get(instanceId);
    if (subscribers === undefined) {
      return;
    }
    authoritativeCountsByInstanceId.delete(instanceId);
    removedInstanceIds.add(instanceId);
    dirtyInstanceIds.add(instanceId);
    scheduleFlush();
  };

  return {
    replaceSubscriptions,
    unsubscribe: removeSocket,
    recordLogAdded,
    recordLogsCleared,
    recordInstanceRemoved,
    flush,
  };
};

const instanceSummaryStream = createInstanceSummaryStreamBroker();

export const replaceInstanceSummarySubscriptions =
  instanceSummaryStream.replaceSubscriptions;
export const unsubscribeFromInstanceSummaryStream =
  instanceSummaryStream.unsubscribe;
export const broadcastInstanceLogAdded = instanceSummaryStream.recordLogAdded;
export const broadcastInstanceLogsCleared =
  instanceSummaryStream.recordLogsCleared;
export const broadcastInstanceRemoved =
  instanceSummaryStream.recordInstanceRemoved;
