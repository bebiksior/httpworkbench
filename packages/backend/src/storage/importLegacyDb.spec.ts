import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type {
  Instance,
  InstanceModeration,
  Log,
  UserNotice,
  UserRecord,
  Webhook,
} from "shared";
import { closeDb, initDb, replaceData } from "./db";
import { maybeAutoImportLegacyDb, runImportLegacyDb } from "./importLegacyDb";

const createUser = (): UserRecord => ({
  id: "user-1",
  googleId: "google-1",
  createdAt: 1,
});

const createWebhook = (): Webhook => ({
  id: "webhook-1",
  name: "Alerts",
  url: "https://discord.com/api/webhooks/123/token",
  ownerId: "user-1",
  createdAt: 2,
});

const createInstance = (): Instance => ({
  id: "inst-1",
  ownerId: "user-1",
  createdAt: 3,
  webhookIds: ["webhook-1"],
  public: false,
  locked: false,
  kind: "static",
  raw: "HTTP/1.1 200 OK\r\n\r\nok",
});

const createLog = (): Log => ({
  id: "log-1",
  instanceId: "inst-1",
  type: "http",
  timestamp: 4,
  address: "127.0.0.1",
  raw: "GET / HTTP/1.1",
});

const createNotice = (): UserNotice => ({
  id: "notice-1",
  userId: "user-1",
  kind: "instance_removed_noise",
  instanceId: "inst-1",
  createdAt: 5,
});

const createLegacyData = (): {
  users: UserRecord[];
  instances: Instance[];
  logs: Log[];
  webhooks: Webhook[];
  instanceModerations: InstanceModeration[];
  userNotices: UserNotice[];
} => ({
  users: [createUser()],
  instances: [createInstance()],
  logs: [createLog()],
  webhooks: [createWebhook()],
  instanceModerations: [
    {
      instanceId: "inst-1",
      window5mStartMs: 10,
      requestsInWindow5m: 1,
      strikeCommittedForWindow: false,
      strikeTimestampsMs: [],
      window15mStartMs: 10,
      requestsInWindow15m: 1,
      lastMinuteBucketStartMs: 10,
      requestsInCurrentMinute: 1,
    },
  ],
  userNotices: [createNotice()],
});

const writeLegacyJson = async (
  dataDir: string,
  data: ReturnType<typeof createLegacyData> = createLegacyData(),
) => {
  await Bun.write(`${dataDir}/db.json`, JSON.stringify(data));
};

const writeLegacyGzip = async (
  dataDir: string,
  data: ReturnType<typeof createLegacyData> = createLegacyData(),
) => {
  await Bun.write(
    `${dataDir}/db.json.gz`,
    gzipSync(JSON.stringify(data)).toString("base64"),
  );
};

let dataDir = "";

describe("runImportLegacyDb", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-import-"));
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("imports a plain legacy db.json into sqlite", async () => {
    await writeLegacyJson(dataDir);

    const result = await runImportLegacyDb({ dataDir, resetTarget: true });

    expect(result).toEqual({
      sqlitePath: `${dataDir}/db.sqlite`,
      users: 1,
      instances: 1,
      logs: 1,
      webhooks: 1,
      instanceModerations: 1,
      userNotices: 1,
    });
  });

  test("imports a gzipped legacy db.json.gz into sqlite", async () => {
    await writeLegacyGzip(dataDir);

    const result = await runImportLegacyDb({ dataDir, resetTarget: true });

    expect(result.sqlitePath).toBe(`${dataDir}/db.sqlite`);
    expect(result.logs).toBe(1);
    expect(result.instances).toBe(1);
  });

  test("imports expired instances without filtering them during verification", async () => {
    await writeLegacyJson(dataDir, {
      ...createLegacyData(),
      instances: [
        {
          ...createInstance(),
          id: "inst-expired",
          expiresAt: 1,
          webhookIds: [],
        },
      ],
      logs: [
        {
          ...createLog(),
          instanceId: "inst-expired",
        },
      ],
      instanceModerations: [
        {
          instanceId: "inst-expired",
          window5mStartMs: 10,
          requestsInWindow5m: 1,
          strikeCommittedForWindow: false,
          strikeTimestampsMs: [],
          window15mStartMs: 10,
          requestsInWindow15m: 1,
          lastMinuteBucketStartMs: 10,
          requestsInCurrentMinute: 1,
        },
      ],
      userNotices: [
        {
          ...createNotice(),
          instanceId: "inst-expired",
        },
      ],
    });

    await expect(
      runImportLegacyDb({ dataDir, resetTarget: true }),
    ).resolves.toEqual({
      sqlitePath: `${dataDir}/db.sqlite`,
      users: 1,
      instances: 1,
      logs: 1,
      webhooks: 1,
      instanceModerations: 1,
      userNotices: 1,
    });
  });

  test("drops invalid and duplicate legacy references", async () => {
    await writeLegacyJson(dataDir, {
      ...createLegacyData(),
      instances: [
        {
          ...createInstance(),
          webhookIds: ["webhook-1", "webhook-1", "webhook-missing"],
        },
      ],
      logs: [
        createLog(),
        {
          ...createLog(),
          id: "log-orphan",
          instanceId: "inst-missing",
        },
      ],
      instanceModerations: [
        {
          instanceId: "inst-1",
          window5mStartMs: 10,
          requestsInWindow5m: 1,
          strikeCommittedForWindow: false,
          strikeTimestampsMs: [],
          window15mStartMs: 10,
          requestsInWindow15m: 1,
          lastMinuteBucketStartMs: 10,
          requestsInCurrentMinute: 1,
        },
        {
          instanceId: "inst-1",
          window5mStartMs: 20,
          requestsInWindow5m: 2,
          strikeCommittedForWindow: true,
          strikeTimestampsMs: Array.of(20),
          window15mStartMs: 20,
          requestsInWindow15m: 2,
          lastMinuteBucketStartMs: 20,
          requestsInCurrentMinute: 2,
        },
        {
          instanceId: "inst-missing",
          window5mStartMs: 10,
          requestsInWindow5m: 1,
          strikeCommittedForWindow: false,
          strikeTimestampsMs: [],
          window15mStartMs: 10,
          requestsInWindow15m: 1,
          lastMinuteBucketStartMs: 10,
          requestsInCurrentMinute: 1,
        },
      ],
    });

    await expect(
      runImportLegacyDb({ dataDir, resetTarget: true }),
    ).resolves.toEqual({
      sqlitePath: `${dataDir}/db.sqlite`,
      users: 1,
      instances: 1,
      logs: 1,
      webhooks: 1,
      instanceModerations: 1,
      userNotices: 1,
    });
  });

  test("auto-imports legacy data when sqlite is still empty", async () => {
    await writeLegacyJson(dataDir);

    await expect(maybeAutoImportLegacyDb({ dataDir })).resolves.toEqual({
      kind: "imported",
      result: {
        sqlitePath: `${dataDir}/db.sqlite`,
        users: 1,
        instances: 1,
        logs: 1,
        webhooks: 1,
        instanceModerations: 1,
        userNotices: 1,
      },
    });

    expect(initDb({ dataDir })).toEqual({
      kind: "ok",
      stats: {
        instancesLength: 1,
        logsLength: 1,
        userNoticesLength: 1,
        usersLength: 1,
        webhooksLength: 1,
      },
    });
  });

  test("skips auto-import when sqlite already has only notices", async () => {
    await writeLegacyJson(dataDir);

    const initResult = initDb({ dataDir, reset: true });
    expect(initResult.kind).toBe("ok");
    replaceData({
      users: [],
      instances: [],
      logs: [],
      webhooks: [],
      instanceModerations: [],
      userNotices: [createNotice()],
    });

    await expect(maybeAutoImportLegacyDb({ dataDir })).resolves.toEqual({
      kind: "skipped",
      reason: "sqlite-has-data",
    });

    expect(initDb({ dataDir })).toEqual({
      kind: "ok",
      stats: {
        instancesLength: 0,
        logsLength: 0,
        userNoticesLength: 1,
        usersLength: 0,
        webhooksLength: 0,
      },
    });
  });

  test("refuses to overwrite an existing sqlite database with only notices without reset", async () => {
    await writeLegacyJson(dataDir);

    const initResult = initDb({ dataDir, reset: true });
    expect(initResult.kind).toBe("ok");
    replaceData({
      users: [],
      instances: [],
      logs: [],
      webhooks: [],
      instanceModerations: [],
      userNotices: [createNotice()],
    });

    await expect(
      runImportLegacyDb({ dataDir, resetTarget: false }),
    ).rejects.toThrow(
      `Target SQLite database already contains data at ${dataDir}/db.sqlite. Set RESET_SQLITE=1 to overwrite it.`,
    );
  });
});
