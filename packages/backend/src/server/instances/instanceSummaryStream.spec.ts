import { describe, expect, mock, test } from "bun:test";
import type { InstanceSummaryStreamServerMessage } from "shared";
import { createInstanceSummaryStreamBroker } from "./instanceSummaryStream";

const createSocket = (bufferedAmount = 0) => ({
  readyState: 1,
  send: mock(),
  close: mock(),
  getBufferedAmount: () => bufferedAmount,
});

const messagesFor = (socket: ReturnType<typeof createSocket>) =>
  socket.send.mock.calls.map(
    ([payload]) =>
      JSON.parse(String(payload)) as InstanceSummaryStreamServerMessage,
  );

describe("instance summary stream broker", () => {
  test("sends an authoritative snapshot and batches absolute counts", () => {
    const broker = createInstanceSummaryStreamBroker();
    const socket = createSocket();
    broker.replaceSubscriptions(
      socket,
      [
        { instanceId: "abcd1234", count: 3 },
        { instanceId: "efgh5678", count: 0 },
      ],
      1,
    );

    broker.recordLogAdded("abcd1234");
    broker.recordLogAdded("abcd1234");
    broker.recordLogAdded("efgh5678");
    broker.flush();

    expect(messagesFor(socket)).toEqual([
      {
        type: "snapshot",
        generation: 1,
        sequence: 1,
        counts: [
          { instanceId: "abcd1234", count: 3 },
          { instanceId: "efgh5678", count: 0 },
        ],
      },
      {
        type: "counts",
        generation: 1,
        sequence: 2,
        counts: [
          { instanceId: "abcd1234", count: 5 },
          { instanceId: "efgh5678", count: 1 },
        ],
        removedInstanceIds: [],
      },
    ]);
  });

  test("preserves clear and add ordering within one batch", () => {
    const broker = createInstanceSummaryStreamBroker();
    const socket = createSocket();
    broker.replaceSubscriptions(
      socket,
      [{ instanceId: "abcd1234", count: 9 }],
      1,
    );

    broker.recordLogAdded("abcd1234");
    broker.recordLogsCleared("abcd1234");
    broker.recordLogAdded("abcd1234");
    broker.flush();

    expect(messagesFor(socket)[1]).toEqual({
      type: "counts",
      generation: 1,
      sequence: 2,
      counts: [{ instanceId: "abcd1234", count: 1 }],
      removedInstanceIds: [],
    });
  });

  test("removes instances and stops future fan-out", () => {
    const broker = createInstanceSummaryStreamBroker();
    const socket = createSocket();
    broker.replaceSubscriptions(
      socket,
      [{ instanceId: "abcd1234", count: 2 }],
      1,
    );

    broker.recordInstanceRemoved("abcd1234");
    broker.recordLogAdded("abcd1234");
    broker.flush();

    expect(messagesFor(socket)[1]).toEqual({
      type: "counts",
      generation: 1,
      sequence: 2,
      counts: [],
      removedInstanceIds: ["abcd1234"],
    });
  });

  test("replaces subscriptions without leaking pending updates", () => {
    const broker = createInstanceSummaryStreamBroker();
    const socket = createSocket();
    broker.replaceSubscriptions(
      socket,
      [{ instanceId: "abcd1234", count: 1 }],
      1,
    );
    broker.recordLogAdded("abcd1234");

    broker.replaceSubscriptions(
      socket,
      [{ instanceId: "efgh5678", count: 4 }],
      2,
    );
    broker.flush();
    broker.recordLogAdded("abcd1234");
    broker.recordLogAdded("efgh5678");
    broker.flush();

    expect(messagesFor(socket)).toEqual([
      {
        type: "snapshot",
        generation: 1,
        sequence: 1,
        counts: [{ instanceId: "abcd1234", count: 1 }],
      },
      {
        type: "snapshot",
        generation: 2,
        sequence: 1,
        counts: [{ instanceId: "efgh5678", count: 4 }],
      },
      {
        type: "counts",
        generation: 2,
        sequence: 2,
        counts: [{ instanceId: "efgh5678", count: 5 }],
        removedInstanceIds: [],
      },
    ]);
  });

  test("closes and unregisters backpressured sockets", () => {
    const broker = createInstanceSummaryStreamBroker({
      maxSocketBufferedBytes: 1,
    });
    const socket = createSocket();

    broker.replaceSubscriptions(
      socket,
      [{ instanceId: "abcd1234", count: 1 }],
      1,
    );
    broker.recordLogAdded("abcd1234");
    broker.flush();

    expect(socket.close).toHaveBeenCalledWith(
      1013,
      "Instance summary stream client is too slow",
    );
    expect(socket.send).not.toHaveBeenCalled();
  });
});
