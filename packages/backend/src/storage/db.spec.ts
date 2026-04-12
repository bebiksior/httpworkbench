import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import type { Instance, Log, UserRecord, Webhook } from "shared";
import { closeDb, initDb, replaceData, resolveSqliteDbPath } from "./db";

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

let dataDir = "";

describe("storage db migrations", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-db-"));
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("initDb applies drizzle migrations on a fresh database", () => {
    const result = initDb({ dataDir, reset: true });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }

    expect(result.stats).toEqual({
      instancesLength: 0,
      logsLength: 0,
      userNoticesLength: 0,
      usersLength: 0,
      webhooksLength: 0,
    });

    closeDb();

    const sqlite = new Database(resolveSqliteDbPath(dataDir));
    const tables = sqlite
      .query("SELECT name FROM sqlite_master WHERE type = ?1 ORDER BY name ASC")
      .all("table");
    sqlite.close();

    expect(tables).toEqual([
      { name: "__drizzle_migrations" },
      { name: "instanceModerations" },
      { name: "instanceWebhooks" },
      { name: "instances" },
      { name: "logs" },
      { name: "sqlite_sequence" },
      { name: "userNotices" },
      { name: "users" },
      { name: "webhooks" },
    ]);
  });

  test("initDb preserves existing data when reopened", () => {
    const first = initDb({ dataDir, reset: true });
    expect(first.kind).toBe("ok");

    replaceData({
      users: [createUser()],
      instances: [createInstance()],
      logs: [createLog()],
      webhooks: [createWebhook()],
      instanceModerations: [],
      userNotices: [],
    });
    closeDb();

    const reopened = initDb({ dataDir });

    expect(reopened).toEqual({
      kind: "ok",
      stats: {
        instancesLength: 1,
        logsLength: 1,
        userNoticesLength: 0,
        usersLength: 1,
        webhooksLength: 1,
      },
    });
  });

  test("initDb reset recreates an empty migrated database", () => {
    const first = initDb({ dataDir, reset: true });
    expect(first.kind).toBe("ok");

    replaceData({
      users: [createUser()],
      instances: [createInstance()],
      logs: [createLog()],
      webhooks: [createWebhook()],
      instanceModerations: [],
      userNotices: [],
    });

    const reset = initDb({ dataDir, reset: true });

    expect(reset).toEqual({
      kind: "ok",
      stats: {
        instancesLength: 0,
        logsLength: 0,
        userNoticesLength: 0,
        usersLength: 0,
        webhooksLength: 0,
      },
    });
  });
});
