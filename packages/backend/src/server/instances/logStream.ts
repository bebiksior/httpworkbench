import type { Log } from "shared";

interface LogStreamSocket {
  send(data: string): unknown;
  readonly readyState: number;
}

const listeners = new Map<string, Set<LogStreamSocket>>();

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
  const sockets = listeners.get(log.instanceId);
  if (sockets === undefined) {
    return;
  }
  const payload = JSON.stringify(log);
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      socket.send(payload);
      continue;
    }
    sockets.delete(socket);
  }
  if (sockets.size === 0) {
    listeners.delete(log.instanceId);
  }
};
