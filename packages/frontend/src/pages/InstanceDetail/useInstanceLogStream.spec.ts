import { createRenderer, defineComponent, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { InstanceDetailResponse, Log } from "shared";
import {
  MAX_RETAINED_RECENT_LOGS,
  parseStreamLog,
  useInstanceLogStream,
} from "./useInstanceLogStream";

const log: Log = {
  id: "log-1",
  instanceId: "instance-1",
  type: "http",
  timestamp: 1,
  address: "127.0.0.1",
  raw: "GET / HTTP/1.1",
};

describe("instance log stream helpers", () => {
  test("parses valid log messages and ignores protocol or invalid messages", () => {
    expect(parseStreamLog(JSON.stringify(log))).toEqual(log);
    expect(parseStreamLog("pong")).toBeUndefined();
    expect(parseStreamLog("not-json")).toBeUndefined();
  });
});

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly protocols?: string | string[];
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  onclose: ((event: CloseEvent) => unknown) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    return this.onopen?.(new Event("open"));
  }

  message(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }
}

const renderer = createRenderer<Record<string, never>, Record<string, never>>({
  patchProp: () => undefined,
  insert: () => undefined,
  remove: () => undefined,
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText: () => undefined,
  setElementText: () => undefined,
  parentNode: () => null,
  nextSibling: () => null,
});

let visibilityChangeListener: EventListener | undefined;

const mountStream = (
  refetch = vi.fn(),
  options: Parameters<typeof useInstanceLogStream>[3] = {},
) => {
  const id = ref("instance-1");
  const detail = ref<InstanceDetailResponse>();
  let stream: ReturnType<typeof useInstanceLogStream> | undefined;
  const app = renderer.createApp(
    defineComponent({
      setup() {
        stream = useInstanceLogStream(id, detail, refetch, options);
        return () => null;
      },
    }),
  );
  app.mount({});
  return {
    app,
    detail,
    id,
    logs: () => stream?.logs,
    stream: () => stream,
    refetch,
  };
};

describe("instance log stream lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("window", {
      location: { protocol: "https:", host: "workbench.test" },
    });
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === "visibilitychange") {
          visibilityChangeListener = listener;
        }
      }),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    visibilityChangeListener = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("reconnects after a closed connection", () => {
    const { app } = mountStream();
    const first = FakeWebSocket.instances[0];
    expect(first).toBeDefined();
    first?.open();
    first?.close();

    vi.advanceTimersByTime(249);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    app.unmount();
  });

  test("reconnects when opening times out", () => {
    const { app } = mountStream();
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(10_000);

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[0]?.readyState).toBe(FakeWebSocket.CLOSED);
    app.unmount();
  });

  test("reconnects when a heartbeat response times out", () => {
    const { app } = mountStream();
    const first = FakeWebSocket.instances[0];
    first?.open();
    expect(first?.sent).toEqual(["ping"]);

    vi.advanceTimersByTime(30_000);

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(first?.readyState).toBe(FakeWebSocket.CLOSED);
    app.unmount();
  });

  test("resyncs on open and visibility recovery without interval polling", async () => {
    const { app, refetch } = mountStream();
    const socket = FakeWebSocket.instances[0];
    await socket?.open();
    expect(refetch).toHaveBeenCalledTimes(1);

    socket?.message("pong");
    vi.advanceTimersByTime(15_000);
    expect(refetch).toHaveBeenCalledTimes(1);

    await visibilityChangeListener?.(new Event("visibilitychange"));
    expect(refetch).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  test("clears logs on ID changes and closes everything on unmount", async () => {
    const { app, id, logs } = mountStream();
    const first = FakeWebSocket.instances[0];
    first?.open();
    first?.message(JSON.stringify(log));
    expect(logs()?.value).toEqual([log]);

    id.value = "instance-2";
    await nextTick();

    expect(logs()?.value).toEqual([]);
    expect(first?.readyState).toBe(FakeWebSocket.CLOSED);
    expect(FakeWebSocket.instances[1]?.url).toContain("instance-2");

    app.unmount();
    expect(FakeWebSocket.instances[1]?.readyState).toBe(FakeWebSocket.CLOSED);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  test("bounds the live segment while keeping streamed logs newest-first", () => {
    const { app, logs } = mountStream();
    const socket = FakeWebSocket.instances[0];
    socket?.open();

    for (let index = 1; index <= MAX_RETAINED_RECENT_LOGS + 1; index += 1) {
      socket?.message(JSON.stringify({ ...log, id: `log-${index}` }));
    }
    socket?.message(
      JSON.stringify({ ...log, id: `log-${MAX_RETAINED_RECENT_LOGS + 1}` }),
    );

    expect(logs()?.value).toHaveLength(MAX_RETAINED_RECENT_LOGS);
    expect(logs()?.value[0]?.id).toBe(`log-${MAX_RETAINED_RECENT_LOGS + 1}`);
    expect(logs()?.value.at(-1)?.id).toBe("log-2");
    app.unmount();
  });

  test("normalizes detail snapshots to newest-first order", async () => {
    const { app, detail, logs } = mountStream();
    detail.value = {
      instance: {
        id: "instance-1",
        ownerId: "owner",
        createdAt: 1,
        webhookIds: [],
        public: false,
        locked: false,
        raw: "HTTP/1.1 200 OK\r\n\r\nok",
      },
      logs: [
        { ...log, id: "oldest" },
        { ...log, id: "newest" },
      ],
    };
    await nextTick();

    expect(logs()?.value.map((entry) => entry.id)).toEqual([
      "newest",
      "oldest",
    ]);
    app.unmount();
  });

  test("preserves logs that arrive while an opening snapshot is loading", async () => {
    let finishRefetch: (() => void) | undefined;
    const refetch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefetch = resolve;
        }),
    );
    const { app, detail, logs } = mountStream(refetch);
    const socket = FakeWebSocket.instances[0];
    socket?.open();
    socket?.message(JSON.stringify(log));

    detail.value = {
      instance: {
        id: "instance-1",
        ownerId: "owner",
        createdAt: 1,
        webhookIds: [],
        public: false,
        locked: false,
        raw: "HTTP/1.1 200 OK\r\n\r\nok",
      },
      logs: [],
    };
    await nextTick();
    expect(logs()?.value).toEqual([]);

    finishRefetch?.();
    await nextTick();
    await nextTick();

    expect(logs()?.value).toEqual([log]);
    app.unmount();
  });

  test("appends older pages and preserves them across recent resyncs", async () => {
    const loadOlderPage = vi.fn(async () => ({
      logs: [
        { ...log, id: "oldest" },
        { ...log, id: "older" },
      ],
      olderLogsCursor: "next-page",
    }));
    const { app, detail, logs, stream } = mountStream(vi.fn(), {
      loadOlderPage,
    });
    const socket = FakeWebSocket.instances[0];
    socket?.open();
    detail.value = {
      instance: {
        id: "instance-1",
        ownerId: "owner",
        createdAt: 1,
        webhookIds: [],
        public: false,
        locked: false,
        raw: "HTTP/1.1 200 OK\r\n\r\nok",
      },
      logs: [
        { ...log, id: "recent-1" },
        { ...log, id: "recent-2" },
      ],
      olderLogsCursor: "first-page",
    } as InstanceDetailResponse;
    await nextTick();

    await stream()?.loadOlder();
    expect(loadOlderPage).toHaveBeenCalledWith("first-page");
    expect(logs()?.value.map(({ id }) => id)).toEqual([
      "recent-2",
      "recent-1",
      "older",
      "oldest",
    ]);

    for (let index = 1; index <= MAX_RETAINED_RECENT_LOGS + 20; index += 1) {
      socket?.message(JSON.stringify({ ...log, id: `stream-${index}` }));
    }
    expect(logs()?.value).toHaveLength(MAX_RETAINED_RECENT_LOGS + 2);
    expect(
      logs()
        ?.value.slice(-2)
        .map(({ id }) => id),
    ).toEqual(["older", "oldest"]);

    detail.value = {
      ...detail.value,
      logs: [
        { ...log, id: "recent-2" },
        { ...log, id: "recent-3" },
      ],
      olderLogsCursor: "first-page",
    } as InstanceDetailResponse;
    await nextTick();

    expect(logs()?.value[0]?.id).toBe("recent-3");
    expect(
      logs()
        ?.value.slice(-2)
        .map(({ id }) => id),
    ).toEqual(["older", "oldest"]);
    expect(stream()?.hasOlderLogs.value).toBe(true);
    app.unmount();
  });

  test("clears loaded history when an empty detail snapshot arrives", async () => {
    const { app, detail, logs } = mountStream();
    detail.value = {
      instance: {
        id: "instance-1",
        ownerId: "owner",
        createdAt: 1,
        webhookIds: [],
        public: false,
        locked: false,
        raw: "HTTP/1.1 200 OK\r\n\r\nok",
      },
      logs: [{ ...log, id: "existing" }],
    };
    await nextTick();
    expect(logs()?.value).toHaveLength(1);

    detail.value = { ...detail.value, logs: [] };
    await nextTick();
    expect(logs()?.value).toEqual([]);
    app.unmount();
  });

  test("uses the guest token WebSocket subprotocol", () => {
    const { app } = mountStream(vi.fn(), {
      getWebSocketProtocols: () => ["guest-token.secret"],
    });
    expect(FakeWebSocket.instances[0]?.protocols).toEqual([
      "guest-token.secret",
    ]);
    app.unmount();
  });
});
