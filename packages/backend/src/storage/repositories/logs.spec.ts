import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import type { Instance, Log, Webhook } from "shared";
import { closeDb, getDb, initDb } from "../db";
import { toDomainModeration, toModerationRow, toWebhookRow } from "../records";
import {
  instanceModerations,
  instances,
  logs as logsTable,
  userNotices,
  webhooks as webhooksTable,
} from "../schema";
import {
  addLog,
  clearLogsForInstance,
  flushPendingWebhookNotifications,
  getLogsForInstance,
  getLogsForInstancePage,
  getRecentLogsForInstance,
  getRecentLogsForInstancePage,
} from "./logs";
import {
  addInstance,
  countActiveInstancesByOwner,
  deleteInstance,
  getInstanceAccessMetadata,
  getInstanceSummariesByOwner,
  getServableInstanceById,
  getWebhookIdsForInstance,
  hasActiveInstance,
  removeExpiredInstances,
} from "./instances";

const createInstance = (overrides?: Partial<Instance>): Instance => ({
  id: "inst-1",
  ownerId: "user-1",
  createdAt: 1,
  webhookIds: [],
  public: false,
  locked: false,
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
  for (const webhook of overrides?.webhooks ?? []) {
    getDb().insert(webhooksTable).values(toWebhookRow(webhook)).run();
  }
  for (const instance of overrides?.instances ?? []) {
    addInstance(instance);
  }
  for (const log of overrides?.logs ?? []) {
    getDb().insert(logsTable).values(log).run();
  }
  for (const moderation of overrides?.instanceModerations ?? []) {
    getDb()
      .insert(instanceModerations)
      .values(toModerationRow(moderation))
      .run();
  }
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

  test("persists smtp logs", () => {
    seedStorage({ instances: [createInstance()] });

    const log = createLog({
      id: "smtp-1",
      type: "smtp",
      raw: "CLIENT: 198.51.100.5\nMAIL FROM: <a@evil.test>\n\nSubject: hi\r\n\r\nbody\r\n",
    });
    const returned = addLog(log);

    expect(returned).toEqual(log);
    expect(getLogsForInstance("inst-1")).toEqual([log]);
  });

  test("tombstones noisy instances immediately in memory", () => {
    seedStorage({
      instances: [createInstance()],
      instanceModerations: [
        {
          instanceId: "inst-1",
          window5mStartMs: 1_000,
          requestsInWindow5m: 349,
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

  test("does not deliver webhooks after an instance expires", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    seedStorage({
      instances: [
        createInstance({
          expiresAt: 999,
          webhookIds: ["webhook-logs-test"],
        }),
      ],
      webhooks: [createWebhook()],
    });

    addLog(createLog({ timestamp: 1_000 }));
    await flushPendingWebhookNotifications();

    expect(fetchMock).not.toHaveBeenCalled();
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
    const trackedFlush = flushPromise.then(() => {
      flushed = true;
    });

    await Bun.sleep(0);
    expect(flushed).toBe(false);
    expect(resolveFetch).toBeDefined();

    resolveFetch?.(new Response(null));
    await trackedFlush;

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

  test("paginates logs by sequence without skipping identical timestamps", () => {
    seedStorage({
      instances: [createInstance()],
      logs: [
        createLog({ id: "log-1", timestamp: 1_000 }),
        createLog({ id: "log-2", timestamp: 1_000 }),
        createLog({ id: "log-3", timestamp: 1_000 }),
      ],
    });

    const firstPage = getLogsForInstancePage({
      instanceId: "inst-1",
      limit: 2,
    });

    expect(firstPage.logs.map((log) => log.id)).toEqual(["log-1", "log-2"]);
    expect(firstPage.nextCursor).toEqual({ seq: 2 });
    expect(firstPage.resumeCursor).toEqual({ seq: 2 });

    const secondPage = getLogsForInstancePage({
      instanceId: "inst-1",
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.logs.map((log) => log.id)).toEqual(["log-3"]);
    expect(secondPage.nextCursor).toBeUndefined();
    expect(secondPage.resumeCursor).toEqual({ seq: 3 });

    const waitingPage = getLogsForInstancePage({
      instanceId: "inst-1",
      limit: 2,
      cursor: secondPage.resumeCursor,
    });
    expect(waitingPage.logs).toEqual([]);
    expect(waitingPage.resumeCursor).toEqual({ seq: 3 });
  });

  test("loads only the requested number of most recent logs", () => {
    seedStorage({
      instances: [createInstance()],
      logs: Array.from({ length: 105 }, (_, index) =>
        createLog({ id: `log-${index + 1}`, timestamp: index + 1 }),
      ),
    });

    const recent = getRecentLogsForInstance("inst-1", 100);

    expect(recent).toHaveLength(100);
    expect(recent[0]?.id).toBe("log-6");
    expect(recent.at(-1)?.id).toBe("log-105");

    const firstPage = getRecentLogsForInstancePage({
      instanceId: "inst-1",
      limit: 100,
    });
    expect(firstPage.olderCursor).toEqual({ seq: 6 });
    const olderPage = getRecentLogsForInstancePage({
      instanceId: "inst-1",
      limit: 100,
      before: firstPage.olderCursor,
    });
    expect(olderPage.logs.map((log) => log.id)).toEqual([
      "log-1",
      "log-2",
      "log-3",
      "log-4",
      "log-5",
    ]);
    expect(olderPage.olderCursor).toBeUndefined();
  });

  test("filters paginated logs by type and timestamp", () => {
    seedStorage({
      instances: [createInstance()],
      logs: [
        createLog({ id: "log-1", type: "http", timestamp: 1_000 }),
        createLog({ id: "log-2", type: "dns", timestamp: 2_000 }),
        createLog({ id: "log-3", type: "http", timestamp: 3_000 }),
      ],
    });

    const page = getLogsForInstancePage({
      instanceId: "inst-1",
      limit: 50,
      type: "http",
      sinceTimestamp: 2_000,
    });

    expect(page.logs.map((log) => log.id)).toEqual(["log-3"]);
    expect(page.nextCursor).toBeUndefined();
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

  test("filters expired instances and counts active rows in SQL", () => {
    seedStorage({
      instances: [
        createInstance({ expiresAt: 10 }),
        createInstance({ id: "inst-2", expiresAt: Date.now() + 60_000 }),
        createInstance({ id: "inst-3", ownerId: "user-2" }),
      ],
    });

    expect(
      getInstanceSummariesByOwner("user-1").map((instance) => instance.id),
    ).toEqual(["inst-2"]);
    expect(countActiveInstancesByOwner("user-1")).toBe(1);
  });

  test("uses lightweight projections for summaries and protocol lookups", () => {
    seedStorage({
      instances: [
        createInstance({ webhookIds: ["webhook-logs-test"] }),
        createInstance({ id: "expired", expiresAt: 10 }),
      ],
      webhooks: [createWebhook()],
    });

    const [summary] = getInstanceSummariesByOwner("user-1");
    if (summary === undefined) {
      throw new Error("Expected an active instance summary");
    }
    expect(summary).toEqual({
      id: "inst-1",
      ownerId: "user-1",
      createdAt: 1,
      public: false,
      locked: false,
      logCount: 0,
    });
    expect("raw" in summary).toBe(false);
    expect("webhookIds" in summary).toBe(false);
    expect(getServableInstanceById("inst-1")).toEqual({
      id: "inst-1",
      raw: "HTTP/1.1 200 OK\r\n\r\nok",
    });
    expect(getInstanceAccessMetadata("inst-1")).toEqual({
      id: "inst-1",
      ownerId: "user-1",
      public: false,
    });
    expect(hasActiveInstance("inst-1")).toBe(true);
    expect(hasActiveInstance("expired")).toBe(false);
    expect(getServableInstanceById("expired")).toBeUndefined();
    expect(getWebhookIdsForInstance("inst-1")).toEqual(["webhook-logs-test"]);
  });
});
