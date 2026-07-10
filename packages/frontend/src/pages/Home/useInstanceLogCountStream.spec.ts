import { createRenderer, defineComponent, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { InstanceSummary } from "shared";

vi.mock("@vueuse/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  const { shallowRef, toValue } = await import("vue");

  return {
    ...actual,
    useWebSocket: (
      url: import("vue").MaybeRefOrGetter<string | URL | undefined>,
      options: import("@vueuse/core").UseWebSocketOptions = {},
    ) => {
      const data = shallowRef<unknown>(null);
      const status = shallowRef<"OPEN" | "CONNECTING" | "CLOSED">("CLOSED");
      const ws = shallowRef<WebSocket>();

      const close = () => ws.value?.close();
      const open = () => {
        close();
        const resolvedUrl = toValue(url);
        if (resolvedUrl === undefined) return;
        const socket = new WebSocket(resolvedUrl);
        ws.value = socket;
        status.value = "CONNECTING";
        socket.onopen = () => {
          if (ws.value !== socket) return;
          status.value = "OPEN";
          options.onConnected?.(socket);
        };
        socket.onmessage = (event) => {
          if (ws.value !== socket) return;
          data.value = event.data;
          options.onMessage?.(socket, event);
        };
        socket.onerror = (event) => options.onError?.(socket, event);
        socket.onclose = (event) => {
          if (ws.value !== socket) return;
          ws.value = undefined;
          status.value = "CLOSED";
          options.onDisconnected?.(socket, event);
        };
      };
      const send = (value: string | ArrayBuffer | Blob) => {
        if (status.value !== "OPEN" || ws.value === undefined) return false;
        ws.value.send(value);
        return true;
      };

      if (options.immediate !== false) open();
      return { data, status, ws, open, close, send };
    },
  };
});

import {
  applyInstanceLogCountUpdate,
  buildInstanceSummarySubscriptionMessages,
  parseInstanceSummaryStreamMessage,
  useInstanceLogCountStreamController,
} from "./useInstanceLogCountStream";

const instance = (id: string, logCount: number): InstanceSummary => ({
  id,
  ownerId: "owner",
  createdAt: 1,
  public: false,
  locked: false,
  logCount,
});

describe("instance log count stream helpers", () => {
  test("applies absolute counts while preserving unchanged identities", () => {
    const first = instance("abcd1234", 1);
    const second = instance("efgh5678", 2);
    const result = applyInstanceLogCountUpdate([first, second], {
      counts: [
        { instanceId: "abcd1234", count: 4 },
        { instanceId: "zzzz9999", count: 8 },
      ],
    });

    expect(result).toEqual([{ ...first, logCount: 4 }, second]);
    expect(result[1]).toBe(second);
  });

  test("treats snapshots as authoritative and applies removals", () => {
    const first = instance("abcd1234", 1);
    const second = instance("efgh5678", 2);

    expect(
      applyInstanceLogCountUpdate([first, second], {
        counts: [{ instanceId: "abcd1234", count: 1 }],
        authoritative: true,
      }),
    ).toEqual([first]);
    expect(
      applyInstanceLogCountUpdate([first, second], {
        counts: [],
        removedInstanceIds: ["efgh5678"],
      }),
    ).toEqual([first]);
  });

  test("parses valid messages and rejects malformed counts", () => {
    expect(
      parseInstanceSummaryStreamMessage(
        JSON.stringify({
          type: "snapshot",
          generation: 1,
          sequence: 1,
          counts: [{ instanceId: "abcd1234", count: 3 }],
        }),
      ),
    ).toEqual({
      type: "snapshot",
      generation: 1,
      sequence: 1,
      counts: [{ instanceId: "abcd1234", count: 3 }],
    });
    expect(
      parseInstanceSummaryStreamMessage(
        JSON.stringify({
          type: "snapshot",
          generation: 1,
          sequence: 1,
          counts: [{ instanceId: "abcd1234", count: -1 }],
        }),
      ),
    ).toBeUndefined();
  });

  test("chunks large guest subscriptions over one socket generation", () => {
    const records = Array.from({ length: 205 }, (_, index) => ({
      id: index.toString(36).padStart(8, "0").slice(-8),
      token: index.toString(16).padStart(64, "0").slice(-64),
      createdAt: index,
    }));
    const messages = buildInstanceSummarySubscriptionMessages(7, true, records);

    expect(messages).toHaveLength(3);
    expect(
      messages.map((message) =>
        message.type === "subscribe" ? message.instances.length : 0,
      ),
    ).toEqual([100, 100, 5]);
    expect(messages.map((message) => message.type)).toEqual([
      "subscribe",
      "subscribe",
      "subscribe",
    ]);
    expect(messages.at(-1)).toMatchObject({ generation: 7, complete: true });
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

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
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

let visibilityState: DocumentVisibilityState;
let visibilityChangeListener: EventListener | undefined;

const mountStream = () => {
  const enabled = ref(true);
  const isFetching = ref(false);
  const signature = ref("user");
  const updates: Array<Parameters<typeof applyInstanceLogCountUpdate>[1]> = [];
  const app = renderer.createApp(
    defineComponent({
      setup() {
        useInstanceLogCountStreamController({
          enabled,
          isFetching,
          subscriptionSignature: signature,
          getSubscription: () => ({ isGuest: false, records: [] }),
          applyUpdate: (update) => updates.push(update),
        });
        return () => null;
      },
    }),
  );
  app.mount({});
  return { app, enabled, isFetching, signature, updates };
};

describe("instance log count stream lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    FakeWebSocket.instances = [];
    visibilityState = "visible";
    visibilityChangeListener = undefined;
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("window", {
      location: { protocol: "https:", host: "workbench.test" },
    });
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibilityState;
      },
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
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("opens one stream and applies ordered absolute updates", () => {
    const { app, updates } = mountStream();
    const socket = FakeWebSocket.instances[0];
    expect(socket?.url).toBe(
      "wss://workbench.test/api/instance-summaries/stream",
    );
    socket?.open();

    expect(socket?.sent.map((message) => JSON.parse(message))).toEqual([
      {
        type: "subscribe",
        generation: 1,
        instances: [],
        complete: true,
      },
    ]);
    socket?.message({
      type: "snapshot",
      generation: 1,
      sequence: 1,
      counts: [{ instanceId: "abcd1234", count: 3 }],
    });
    socket?.message({
      type: "counts",
      generation: 1,
      sequence: 2,
      counts: [{ instanceId: "abcd1234", count: 4 }],
      removedInstanceIds: [],
    });

    expect(updates).toEqual([
      {
        counts: [{ instanceId: "abcd1234", count: 3 }],
        authoritative: true,
      },
      {
        counts: [{ instanceId: "abcd1234", count: 4 }],
        removedInstanceIds: [],
      },
    ]);
    expect(FakeWebSocket.instances).toHaveLength(1);
    app.unmount();
  });

  test("replays streamed updates after a refetch without resubscribing", async () => {
    const { app, isFetching, updates } = mountStream();
    const socket = FakeWebSocket.instances[0];
    socket?.open();
    socket?.message({
      type: "snapshot",
      generation: 1,
      sequence: 1,
      counts: [],
    });

    isFetching.value = true;
    await nextTick();
    socket?.message({
      type: "counts",
      generation: 1,
      sequence: 2,
      counts: [{ instanceId: "abcd1234", count: 8 }],
      removedInstanceIds: [],
    });
    expect(updates).toHaveLength(1);

    isFetching.value = false;
    await nextTick();
    expect(updates.at(-1)).toEqual({
      counts: [{ instanceId: "abcd1234", count: 8 }],
      removedInstanceIds: [],
    });
    expect(
      socket?.sent
        .map((message) => JSON.parse(message) as { type: string })
        .filter(({ type }) => type === "subscribe"),
    ).toHaveLength(1);
    app.unmount();
  });

  test("resubscribes after a sequence gap that happens during a refetch", async () => {
    const { app, isFetching } = mountStream();
    const socket = FakeWebSocket.instances[0];
    socket?.open();
    socket?.message({
      type: "snapshot",
      generation: 1,
      sequence: 1,
      counts: [],
    });

    isFetching.value = true;
    await nextTick();
    socket?.message({
      type: "counts",
      generation: 1,
      sequence: 3,
      counts: [],
      removedInstanceIds: [],
    });

    isFetching.value = false;
    await nextTick();
    expect(JSON.parse(socket?.sent.at(-1) ?? "{}")).toMatchObject({
      type: "subscribe",
      generation: 2,
    });
    app.unmount();
  });

  test("requests a snapshot on a sequence gap", () => {
    const { app } = mountStream();
    const socket = FakeWebSocket.instances[0];
    socket?.open();
    socket?.message({
      type: "snapshot",
      generation: 1,
      sequence: 1,
      counts: [],
    });
    socket?.message({
      type: "counts",
      generation: 1,
      sequence: 3,
      counts: [],
      removedInstanceIds: [],
    });

    expect(JSON.parse(socket?.sent.at(-1) ?? "{}")).toMatchObject({
      type: "subscribe",
      generation: 2,
    });
    app.unmount();
  });

  test("closes while hidden and reconnects when visible", () => {
    const { app } = mountStream();
    const first = FakeWebSocket.instances[0];
    first?.open();

    visibilityState = "hidden";
    visibilityChangeListener?.(new Event("visibilitychange"));
    expect(first?.readyState).toBe(FakeWebSocket.CLOSED);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    visibilityState = "visible";
    visibilityChangeListener?.(new Event("visibilitychange"));
    expect(FakeWebSocket.instances).toHaveLength(2);
    app.unmount();
  });
});
