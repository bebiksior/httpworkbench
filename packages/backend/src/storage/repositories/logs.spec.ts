import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { Instance, Log, Webhook } from "shared";
import { db, flushScheduledDbWrite } from "../db";
import { addLog } from "./logs";

type StaticInstance = Extract<Instance, { kind: "static" }>;

const createInstance = (
  overrides?: Partial<StaticInstance>,
): StaticInstance => ({
  id: "inst-1",
  ownerId: "user-1",
  createdAt: 1,
  webhookIds: [],
  public: false,
  locked: false,
  kind: "static",
  raw: "HTTP/1.1 200 OK\r\n\r\nok",
  ...overrides,
});

const createLog = (overrides?: Partial<Log>): Log => ({
  id: "log-1",
  instanceId: "inst-1",
  type: "http",
  timestamp: 1_000,
  address: "127.0.0.1",
  raw: "GET / HTTP/1.1",
  ...overrides,
});

const createWebhook = (): Webhook => ({
  id: "webhook-logs-test",
  name: "Alerts",
  url: "https://discord.com/api/webhooks/123456789/token",
  ownerId: "user-1",
  createdAt: 1,
});

const originalFetch = globalThis.fetch;

const resetDbData = () => {
  db.data = {
    users: [],
    instances: [],
    logs: [],
    webhooks: [],
    instanceModerations: [],
    userNotices: [],
  };
};

describe("addLog", () => {
  beforeEach(() => {
    resetDbData();
    spyOn(db, "write").mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await flushScheduledDbWrite();
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("updates logs and moderation state immediately", () => {
    db.data.instances.push(createInstance());

    const log = createLog();
    const returned = addLog(log);

    expect(returned).toEqual(log);
    expect(db.data.logs).toEqual([log]);
    expect(db.data.instanceModerations[0]?.requestsInWindow5m).toBe(1);
    expect(db.data.instanceModerations[0]?.requestsInWindow15m).toBe(1);
    expect(db.data.instanceModerations[0]?.requestsInCurrentMinute).toBe(1);
  });

  test("tombstones noisy instances immediately in memory", () => {
    db.data.instances.push(createInstance());
    db.data.instanceModerations.push({
      instanceId: "inst-1",
      window5mStartMs: 1_000,
      requestsInWindow5m: 299,
      strikeCommittedForWindow: false,
      strikeTimestampsMs: [],
      window15mStartMs: 1_000,
      requestsInWindow15m: 299,
      lastMinuteBucketStartMs: 1_000,
      requestsInCurrentMinute: 0,
    });

    addLog(createLog());

    expect(db.data.instances).toEqual([]);
    expect(db.data.logs).toEqual([]);
    expect(db.data.instanceModerations).toEqual([]);
    expect(db.data.userNotices).toHaveLength(1);
  });

  test("triggers webhook delivery without blocking addLog", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    db.data.instances.push(
      createInstance({ webhookIds: ["webhook-logs-test"] }),
    );
    db.data.webhooks.push(createWebhook());

    const log = createLog();
    const returned = addLog(log);

    expect(returned).toEqual(log);
    expect(db.data.logs).toEqual([log]);

    await Bun.sleep(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
