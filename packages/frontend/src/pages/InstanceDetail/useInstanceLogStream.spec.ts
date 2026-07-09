import {
  createRenderer,
  defineComponent,
  nextTick,
  ref,
  type ComputedRef,
} from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { InstanceDetailResponse, Log } from "shared";
import {
  appendUniqueLog,
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

  test("appends logs once by id", () => {
    expect(appendUniqueLog([], log)).toEqual([log]);
    expect(appendUniqueLog([log], log)).toEqual([log]);
  });
});

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  onclose: ((event: CloseEvent) => unknown) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
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

const mountStream = () => {
  const id = ref("instance-1");
  const detail = ref<InstanceDetailResponse>();
  const refetch = vi.fn();
  let logs: ComputedRef<Log[]> | undefined;
  const app = renderer.createApp(
    defineComponent({
      setup() {
        logs = useInstanceLogStream(id, detail, refetch);
        return () => null;
      },
    }),
  );
  app.mount({});
  return { app, id, logs: () => logs, refetch };
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
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
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
});
