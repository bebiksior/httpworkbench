import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import type { Instance, Log, Webhook } from "shared";
import { closeDb, getDb, initDb, replaceData } from "../db";
import { toDomainModeration } from "../records";
import { instanceModerations, instances, userNotices } from "../schema";
import {
  addLog,
  clearLogsForInstance,
  flushPendingWebhookNotifications,
  getLogsForInstance,
} from "./logs";
import { deleteInstance, removeExpiredInstances } from "./instances";

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
let dataDir = "";

const seedStorage = (
  overrides?: Partial<{
    instances: Instance[];
    logs: Log[];
    webhooks: Webhook[];
    instanceModerations: Array<{
      instanceId: string;
      window5mStartMs: number;
      requestsInWindow5m: number;
      strikeCommittedForWindow: boolean;
      strikeTimestampsMs: number[];
      discordMutedUntilMs?: number;
      window15mStartMs: number;
      requestsInWindow15m: number;
      lastMinuteBucketStartMs: number;
      requestsInCurrentMinute: number;
    }>;
  }>,
) => {
  replaceData({
    users: [],
    instances: overrides?.instances ?? [],
    logs: overrides?.logs ?? [],
    webhooks: overrides?.webhooks ?? [],
    instanceModerations: overrides?.instanceModerations ?? [],
    userNotices: [],
  });
};

const getModerationForInstance = (instanceId: string) => {
  const row = getDb()
    .select()
    .from(instanceModerations)
    .where(eq(instanceModerations.instanceId, instanceId))
    .get();

  if (row === undefined) {
    return undefined;
  }

  return toDomainModeration(row);
};

const getUserNoticeCount = () => {
  return getDb().select({ count: count() }).from(userNotices).get()?.count ?? 0;
};

describe("addLog", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-storage-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
    mock.restore();
  });

  test("updates logs and moderation state immediately", () => {
    seedStorage({ instances: [createInstance()] });

    const log = createLog();
    const returned = addLog(log);

    expect(returned).toEqual(log);
    expect(getLogsForInstance("inst-1")).toEqual([log]);
    expect(getModerationForInstance("inst-1")?.requestsInWindow5m).toBe(1);
    expect(getModerationForInstance("inst-1")?.requestsInWindow15m).toBe(1);
    expect(getModerationForInstance("inst-1")?.requestsInCurrentMinute).toBe(1);
  });

  test("tombstones noisy instances immediately in memory", () => {
    seedStorage({
      instances: [createInstance()],
      instanceModerations: [
        {
          instanceId: "inst-1",
          window5mStartMs: 1_000,
          requestsInWindow5m: 299,
          strikeCommittedForWindow: false,
          strikeTimestampsMs: [],
          window15mStartMs: 1_000,
          requestsInWindow15m: 299,
          lastMinuteBucketStartMs: 1_000,
          requestsInCurrentMinute: 0,
        },
      ],
    });

    addLog(createLog());

    expect(getDb().select({ id: instances.id }).from(instances).all()).toEqual(
      [],
    );
    expect(getLogsForInstance("inst-1")).toEqual([]);
    expect(getModerationForInstance("inst-1")).toBeUndefined();
    expect(getUserNoticeCount()).toBe(1);
  });

  test("triggers webhook delivery without blocking addLog", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    seedStorage({
      instances: [createInstance({ webhookIds: ["webhook-logs-test"] })],
      webhooks: [createWebhook()],
    });

    const log = createLog();
    const returned = addLog(log);

    expect(returned).toEqual(log);
    expect(getLogsForInstance("inst-1")).toEqual([log]);

    await Bun.sleep(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("flushes pending webhook deliveries before shutdown", async () => {
    const webhookId = "webhook-logs-flush-test";
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = mock(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    seedStorage({
      instances: [createInstance({ webhookIds: [webhookId] })],
      webhooks: [{ ...createWebhook(), id: webhookId }],
    });

    addLog(createLog());

    const flushPromise = flushPendingWebhookNotifications();
    let flushed = false;
    void flushPromise.then(() => {
      flushed = true;
    });

    await Bun.sleep(0);
    expect(flushed).toBe(false);
    expect(resolveFetch).toBeDefined();

    resolveFetch?.(new Response(null));
    await flushPromise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(flushed).toBe(true);
  });

  test("clears logs for a single instance only", () => {
    seedStorage({
      instances: [createInstance(), createInstance({ id: "inst-2" })],
      logs: [
        createLog(),
        createLog({ id: "log-2", instanceId: "inst-2" }),
        createLog({ id: "log-3", instanceId: "inst-1" }),
      ],
    });

    clearLogsForInstance("inst-1");

    expect(getLogsForInstance("inst-1")).toEqual([]);
    expect(getLogsForInstance("inst-2")).toEqual([
      createLog({ id: "log-2", instanceId: "inst-2" }),
    ]);
  });

  test("deletes instances with cascading logs and moderations", () => {
    seedStorage({
      instances: [createInstance()],
      logs: [createLog()],
      instanceModerations: [
        {
          instanceId: "inst-1",
          window5mStartMs: 1_000,
          requestsInWindow5m: 1,
          strikeCommittedForWindow: false,
          strikeTimestampsMs: [],
          window15mStartMs: 1_000,
          requestsInWindow15m: 1,
          lastMinuteBucketStartMs: 1_000,
          requestsInCurrentMinute: 1,
        },
      ],
    });

    deleteInstance("inst-1");

    expect(getDb().select({ id: instances.id }).from(instances).all()).toEqual(
      [],
    );
    expect(getLogsForInstance("inst-1")).toEqual([]);
    expect(getModerationForInstance("inst-1")).toBeUndefined();
  });

  test("cleans up expired instances and their logs", () => {
    seedStorage({
      instances: [
        createInstance({ expiresAt: 10 }),
        createInstance({ id: "inst-2", expiresAt: Date.now() + 60_000 }),
      ],
      logs: [createLog(), createLog({ id: "log-2", instanceId: "inst-2" })],
    });

    const removedCount = removeExpiredInstances(Date.now()).length;

    expect(removedCount).toBe(1);
    expect(
      getDb()
        .select({ id: instances.id })
        .from(instances)
        .orderBy(instances.id)
        .all(),
    ).toEqual([{ id: "inst-2" }]);
    expect(getLogsForInstance("inst-1")).toEqual([]);
    expect(getLogsForInstance("inst-2")).toEqual([
      createLog({ id: "log-2", instanceId: "inst-2" }),
    ]);
  });
});
