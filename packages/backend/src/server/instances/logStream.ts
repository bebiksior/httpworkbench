import type { Log } from "shared";

interface LogStreamSocket {
  send(data: string): unknown;
  readonly readyState: number;
  getBufferedAmount?: () => number;
  close?: (code?: number, reason?: string) => unknown;
}

const listeners = new Map<string, Set<LogStreamSocket>>();
const logWaiters = new Map<string, Set<() => void>>();
const maxSocketBufferedBytes = 1024 * 1024;

export const waitForInstanceLog = (instanceId: string, timeoutMs: number) => {
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

  const settle = () => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    waiters.delete(settle);
    if (waiters.size === 0) {
      logWaiters.delete(instanceId);
    }
    resolvePromise();
  };
  const timeout = setTimeout(settle, timeoutMs);
  waiters.add(settle);

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
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      if ((socket.getBufferedAmount?.() ?? 0) > maxSocketBufferedBytes) {
        socket.close?.(1013, "Log stream client is too slow");
        sockets.delete(socket);
        continue;
      }
      socket.send(payload);
      continue;
    }
    sockets.delete(socket);
  }
  if (sockets.size === 0) {
    listeners.delete(log.instanceId);
  }
};
