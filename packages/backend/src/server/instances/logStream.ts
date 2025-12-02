import type { ServerWebSocket } from "bun";
import type { Log } from "shared";

export type LogStreamSocketData = {
  instanceId: string;
  userId: string;
};

const listeners = new Map<string, Set<ServerWebSocket<LogStreamSocketData>>>();

export const subscribeToLogStream = (
  instanceId: string,
  socket: ServerWebSocket<LogStreamSocketData>,
) => {
  let sockets = listeners.get(instanceId);
  if (sockets === undefined) {
    sockets = new Set();
    listeners.set(instanceId, sockets);
  }
  sockets.add(socket);
};

export const unsubscribeFromLogStream = (
  socket: ServerWebSocket<LogStreamSocketData>,
) => {
  const instanceId = socket.data?.instanceId;
  if (instanceId === undefined) {
    return;
  }
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
