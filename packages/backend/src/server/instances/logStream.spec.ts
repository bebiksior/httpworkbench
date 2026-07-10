import { describe, expect, mock, test } from "bun:test";
import type { Log } from "shared";
import {
  broadcastLog,
  subscribeToLogStream,
  unsubscribeFromLogStream,
  waitForInstanceLog,
} from "./logStream";

const log: Log = {
  id: "log-1",
  instanceId: "instance-1",
  type: "http",
  timestamp: 1,
  address: "127.0.0.1",
  raw: "GET / HTTP/1.1",
};

describe("log stream", () => {
  test("wakes log waiters and supports cancellation", async () => {
    const notified = waitForInstanceLog(log.instanceId, 1000);
    const cancelled = waitForInstanceLog(log.instanceId, 1000);
    cancelled.cancel();

    broadcastLog(log);

    await Promise.all([notified.promise, cancelled.promise]);
  });

  test("disconnects a backpressured subscriber", () => {
    const socket = {
      readyState: 1,
      send: mock(),
      close: mock(),
      getBufferedAmount: () => 2 * 1024 * 1024,
    };
    subscribeToLogStream(log.instanceId, socket);

    broadcastLog(log);
    broadcastLog(log);

    expect(socket.close).toHaveBeenCalledWith(
      1013,
      "Log stream client is too slow",
    );
    expect(socket.send).not.toHaveBeenCalled();
    unsubscribeFromLogStream(log.instanceId, socket);
  });
});
