import type { Log } from "shared";
import { broadcastInstanceLogAdded } from "./instanceSummaryStream";

interface LogStreamSocket {
  send(data: string): unknown;
  readonly readyState: number;
  getBufferedAmount?: () => number;
  close?: (code?: number, reason?: string) => unknown;
}

const listeners = new Map<string, Set<LogStreamSocket>>();
const logWaiters = new Map<string, Set<() => void>>();
const maxSocketBufferedBytes = 1024 * 1024;
const streamEncoder = new TextEncoder();

const closeSlowSocket = (socket: LogStreamSocket): void => {
  try {
    socket.close?.(1013, "Log stream client is too slow");
  } catch {
    // The socket may already have closed between the state and buffer checks.
  }
};

export const waitForInstanceLog = (
  instanceId: string,
  timeoutMs: number,
  signal?: AbortSignal,
) => {
  let waiters = logWaiters.get(instanceId);
  if (waiters === undefined) {
    waiters = new Set();
    logWaiters.set(instanceId, waiters);
  }

  let settled = false;
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const settle = () => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    signal?.removeEventListener("abort", settle);
    waiters.delete(settle);
    if (waiters.size === 0) {
      logWaiters.delete(instanceId);
    }
    resolvePromise();
  };
  timeout = setTimeout(settle, timeoutMs);
  waiters.add(settle);
  if (signal?.aborted === true) {
    settle();
  } else {
    signal?.addEventListener("abort", settle, { once: true });
  }

  return { promise, cancel: settle };
};

export const subscribeToLogStream = (
  instanceId: string,
  socket: LogStreamSocket,
) => {
  let sockets = listeners.get(instanceId);
  if (sockets === undefined) {
    sockets = new Set();
    listeners.set(instanceId, sockets);
  }
  sockets.add(socket);
};

export const unsubscribeFromLogStream = (
  instanceId: string,
  socket: LogStreamSocket,
) => {
  const sockets = listeners.get(instanceId);
  if (sockets === undefined) {
    return;
  }
  sockets.delete(socket);
  if (sockets.size === 0) {
    listeners.delete(instanceId);
  }
};

export const broadcastLog = (log: Log) => {
  broadcastInstanceLogAdded(log.instanceId);
  const waiters = logWaiters.get(log.instanceId);
  if (waiters !== undefined) {
    for (const settle of [...waiters]) {
      settle();
    }
  }

  const sockets = listeners.get(log.instanceId);
  if (sockets === undefined) {
    return;
  }
  const payload = JSON.stringify(log);
  const payloadBytes = streamEncoder.encode(payload).byteLength;
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      let bufferedBytes = 0;
      try {
        bufferedBytes = socket.getBufferedAmount?.() ?? 0;
      } catch {
        closeSlowSocket(socket);
        sockets.delete(socket);
        continue;
      }

      if (payloadBytes + bufferedBytes > maxSocketBufferedBytes) {
        closeSlowSocket(socket);
        sockets.delete(socket);
        continue;
      }

      try {
        socket.send(payload);
      } catch {
        closeSlowSocket(socket);
        sockets.delete(socket);
      }
      continue;
    }
    sockets.delete(socket);
  }
  if (sockets.size === 0) {
    listeners.delete(log.instanceId);
  }
};
