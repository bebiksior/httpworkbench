import type { Log } from "shared";
import { createKeyedWaiters } from "../waiters";

interface LogStreamSocket {
  send(data: string): unknown;
  readonly readyState: number;
  getBufferedAmount?: () => number;
  close?: (code?: number, reason?: string) => unknown;
}

const listeners = new Map<string, Set<LogStreamSocket>>();
const logWaiters = createKeyedWaiters();
const maxSocketBufferedBytes = 1024 * 1024;
const streamEncoder = new TextEncoder();

const closeSlowSocket = (socket: LogStreamSocket): void => {
  try {
    socket.close?.(1013, "Log stream client is too slow");
  } catch {
    // The socket may already have closed between the state and buffer checks.
  }
};

export const waitForInstanceLog = logWaiters.wait;

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
  logWaiters.notify(log.instanceId);

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
