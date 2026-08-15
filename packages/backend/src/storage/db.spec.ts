import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Instance, Log, UserRecord, Webhook } from "shared";
import { closeDb, getDb, initDb, resolveSqliteDbPath } from "./db";
import { addInstance } from "./repositories/instances";
import { addUser } from "./repositories/users";
import { addWebhook } from "./repositories/webhooks";
import { logs } from "./schema";

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
      apiKeysLength: 0,
    });

    closeDb();

    const sqlite = new Database(resolveSqliteDbPath(dataDir));
    const tables = sqlite
      .query("SELECT name FROM sqlite_master WHERE type = ?1 ORDER BY name ASC")
      .all("table");
    sqlite.close();

    expect(tables).toEqual([
      { name: "__drizzle_migrations" },
      { name: "apiKeys" },
      { name: "instanceModerations" },
      { name: "instanceWebhooks" },
      { name: "instances" },
      { name: "logs" },
      { name: "sqlite_sequence" },
      { name: "userNotices" },
      { name: "users" },
      { name: "webhooks" },
    ]);
    expect(
      readdirSync(dataDir).some((name) => name.includes(".pre-migration-")),
    ).toBe(false);
  });

  test("initDb preserves existing data when reopened", () => {
    const first = initDb({ dataDir, reset: true });
    expect(first.kind).toBe("ok");

    addUser(createUser());
    addWebhook(createWebhook());
    addInstance(createInstance());
    getDb().insert(logs).values(createLog()).run();
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
        apiKeysLength: 0,
      },
    });
  });

  test("initDb reset recreates an empty migrated database", () => {
    const first = initDb({ dataDir, reset: true });
    expect(first.kind).toBe("ok");

    addUser(createUser());
    addWebhook(createWebhook());
    addInstance(createInstance());
    getDb().insert(logs).values(createLog()).run();

    const reset = initDb({ dataDir, reset: true });

    expect(reset).toEqual({
      kind: "ok",
      stats: {
        instancesLength: 0,
        logsLength: 0,
        userNoticesLength: 0,
        usersLength: 0,
        webhooksLength: 0,
        apiKeysLength: 0,
      },
    });
  });

  test("grandfathers orphans from databases migrated before the integrity marker", () => {
    const sqlite = new Database(resolveSqliteDbPath(dataDir));
    const migrations = readMigrationFiles({
      migrationsFolder: path.join(import.meta.dir, "../../drizzle"),
    });
    for (const migration of migrations) {
      for (const statement of migration.sql) {
        sqlite.exec(statement);
      }
    }
    sqlite.exec(`
      CREATE TABLE __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at NUMERIC
      );
      INSERT INTO logs (id, instanceId, type, timestamp, address, raw)
        VALUES ('orphan', 'missing', 'http', 1, '127.0.0.1', 'GET /');
    `);
    for (const migration of migrations) {
      sqlite
        .query(
          "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?1, ?2)",
        )
        .run(migration.hash, migration.folderMillis);
    }
    sqlite.close();

    const first = initDb({ dataDir });
    expect(first.kind).toBe("ok");
    closeDb();

    const reopened = initDb({ dataDir });
    expect(reopened.kind).toBe("ok");
    if (reopened.kind === "ok") {
      expect(reopened.stats.logsLength).toBe(1);
    }
  });

  test("rejects an orphan added after a clean integrity check", () => {
    const first = initDb({ dataDir, reset: true });
    expect(first.kind).toBe("ok");
    closeDb();

    const sqlite = new Database(resolveSqliteDbPath(dataDir));
    sqlite.run("PRAGMA foreign_keys = OFF");
    sqlite
      .query(
        "INSERT INTO logs (id, instanceId, type, timestamp, address, raw) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
      .run("orphan", "missing", "http", 1, "127.0.0.1", "GET /");
    sqlite.close();

    const reopened = initDb({ dataDir });
    expect(reopened.kind).toBe("error");
    if (reopened.kind === "error") {
      expect(reopened.error.message).toContain("foreign key violations");
    }
  });

  test("keeps rejecting migration violations after a restart", () => {
    const dbPath = resolveSqliteDbPath(dataDir);
    const sqlite = new Database(dbPath);
    const migrations = readMigrationFiles({
      migrationsFolder: path.join(import.meta.dir, "../../drizzle"),
    });
    for (const migration of migrations.slice(0, 3)) {
      for (const statement of migration.sql) {
        sqlite.exec(statement);
      }
    }
    sqlite.exec(`
      CREATE TABLE __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at NUMERIC
      );
      INSERT INTO logs (id, instanceId, type, timestamp, address, raw)
        VALUES ('orphan', 'missing', 'http', 1, '127.0.0.1', 'GET /');
    `);
    for (const migration of migrations.slice(0, 3)) {
      sqlite
        .query(
          "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?1, ?2)",
        )
        .run(migration.hash, migration.folderMillis);
    }
    sqlite.close();

    const first = initDb({ dataDir });
    expect(first.kind).toBe("error");
    if (first.kind === "error") {
      expect(first.error.message).toContain("foreign key violations");
    }

    const restarted = initDb({ dataDir });
    expect(restarted.kind).toBe("error");
    if (restarted.kind === "error") {
      expect(restarted.error.message).toContain("foreign key violations");
    }
  });

  test("static-only migration removes unusable instances and preserves valid associations", () => {
    const dbPath = resolveSqliteDbPath(dataDir);
    const sqlite = new Database(dbPath);
    const migrations = readMigrationFiles({
      migrationsFolder: path.join(import.meta.dir, "../../drizzle"),
    });
    for (const migration of migrations.slice(0, 3)) {
      for (const statement of migration.sql) {
        sqlite.exec(statement);
      }
    }
    sqlite.exec(`
      CREATE TABLE __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at NUMERIC
      );
      INSERT INTO webhooks (id, name, url, message, ownerId, createdAt)
        VALUES ('webhook-1', 'Alerts', 'https://example.com', NULL, 'owner', 1);
      INSERT INTO instances VALUES
        ('valid', 'owner', 1, NULL, NULL, 0, 0, 'static', 'HTTP/1.1 200 OK\r\n\r\nvalid', NULL),
        ('dynamic', 'owner', 2, NULL, NULL, 0, 0, 'dynamic', NULL, '[]'),
        ('null-raw', 'owner', 3, NULL, NULL, 0, 0, 'static', NULL, NULL),
        ('legacy-guest', 'guest', 4, NULL, NULL, 0, 0, 'static', 'HTTP/1.1 200 OK\r\n\r\nguest', NULL);
      INSERT INTO instanceWebhooks VALUES ('valid', 'webhook-1', 0);
      INSERT INTO instanceWebhooks VALUES ('dynamic', 'webhook-1', 0);
      INSERT INTO logs (id, instanceId, type, timestamp, address, raw) VALUES
        ('log-valid', 'valid', 'http', 1, '127.0.0.1', 'valid'),
        ('log-dynamic', 'dynamic', 'http', 2, '127.0.0.1', 'dynamic'),
        ('log-null', 'null-raw', 'http', 3, '127.0.0.1', 'null'),
        ('log-guest', 'legacy-guest', 'http', 4, '127.0.0.1', 'guest');
      INSERT INTO instanceModerations VALUES
        ('valid', 0, 0, 0, '[]', NULL, 0, 0, 0, 0),
        ('dynamic', 0, 0, 0, '[]', NULL, 0, 0, 0, 0),
        ('legacy-guest', 0, 0, 0, '[]', NULL, 0, 0, 0, 0);
    `);
    for (const migration of migrations.slice(0, 3)) {
      sqlite
        .query(
          "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?1, ?2)",
        )
        .run(migration.hash, migration.folderMillis);
    }
    sqlite.close();

    const upgraded = initDb({ dataDir });
    expect(upgraded.kind).toBe("ok");
    closeDb();

    const backupName = readdirSync(dataDir).find((name) =>
      name.includes(".pre-migration-"),
    );
    expect(backupName).toBeDefined();
    if (backupName === undefined) {
      return;
    }
    const backup = new Database(path.join(dataDir, backupName));
    const backupColumns = backup
      .query("PRAGMA table_info(instances)")
      .all() as Array<{ name: string }>;
    expect(backupColumns.some(({ name }) => name === "kind")).toBe(true);
    expect(
      backup.query("SELECT id, kind FROM instances ORDER BY id").all(),
    ).toEqual([
      { id: "dynamic", kind: "dynamic" },
      { id: "legacy-guest", kind: "static" },
      { id: "null-raw", kind: "static" },
      { id: "valid", kind: "static" },
    ]);
    backup.close();

    const migrated = new Database(dbPath);
    expect(migrated.query("SELECT id, raw FROM instances").all()).toEqual([
      { id: "valid", raw: "HTTP/1.1 200 OK\r\n\r\nvalid" },
    ]);
    expect(
      migrated.query("SELECT instanceId FROM instanceWebhooks").all(),
    ).toEqual([{ instanceId: "valid" }]);
    expect(migrated.query("SELECT instanceId FROM logs").all()).toEqual([
      { instanceId: "valid" },
    ]);
    expect(
      migrated.query("SELECT instanceId FROM instanceModerations").all(),
    ).toEqual([{ instanceId: "valid" }]);

    const columns = migrated
      .query("PRAGMA table_info(instances)")
      .all() as Array<{ name: string; notnull: number }>;
    expect(columns.some((column) => column.name === "kind")).toBe(false);
    expect(columns.some((column) => column.name === "processorsJson")).toBe(
      false,
    );
    expect(columns.find((column) => column.name === "raw")?.notnull).toBe(1);
    const instanceWebhookIndexes = migrated
      .query("PRAGMA index_list(instanceWebhooks)")
      .all() as Array<{ name: string }>;
    expect(
      instanceWebhookIndexes.some(
        ({ name }) => name === "instanceWebhooks_by_instance",
      ),
    ).toBe(false);
    expect(migrated.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      migrated
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'guestInstanceCredentials'",
        )
        .all(),
    ).toEqual([]);
    migrated.close();
  });

  test("JWT guest migration removes guests whose stored tokens become invalid", () => {
    const dbPath = resolveSqliteDbPath(dataDir);
    const sqlite = new Database(dbPath);
    const migrations = readMigrationFiles({
      migrationsFolder: path.join(import.meta.dir, "../../drizzle"),
    });
    for (const migration of migrations.slice(0, 6)) {
      for (const statement of migration.sql) {
        sqlite.exec(statement);
      }
    }
    sqlite.exec(`
      CREATE TABLE __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at NUMERIC
      );
      INSERT INTO instances
        (id, ownerId, createdAt, expiresAt, label, isPublic, isLocked, raw)
        VALUES
          ('jwtguest', 'guest', 1, 9999999999999, NULL, 0, 0, 'HTTP/1.1 200 OK\r\n\r\nguest');
      INSERT INTO guestInstanceCredentials (instanceId, tokenHash)
        VALUES ('jwtguest', '${"a".repeat(64)}');
      INSERT INTO logs (id, instanceId, type, timestamp, address, raw)
        VALUES ('guest-log', 'jwtguest', 'http', 1, '127.0.0.1', 'GET /');
      INSERT INTO instanceModerations
        (instanceId, window5mStartMs, requestsInWindow5m, strikeCommittedForWindow, strikeTimestampsJson, discordMutedUntilMs, window15mStartMs, requestsInWindow15m, lastMinuteBucketStartMs, requestsInCurrentMinute)
        VALUES ('jwtguest', 0, 0, 0, '[]', NULL, 0, 0, 0, 0);
    `);
    for (const migration of migrations.slice(0, 6)) {
      sqlite
        .query(
          "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?1, ?2)",
        )
        .run(migration.hash, migration.folderMillis);
    }
    sqlite.close();

    expect(initDb({ dataDir }).kind).toBe("ok");
    closeDb();

    const migrated = new Database(dbPath);
    expect(
      migrated
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'guestInstanceCredentials'",
        )
        .all(),
    ).toEqual([]);
    expect(
      migrated.query("SELECT id FROM instances WHERE ownerId = 'guest'").all(),
    ).toEqual([]);
    expect(migrated.query("SELECT id FROM logs").all()).toEqual([]);
    expect(
      migrated.query("SELECT instanceId FROM instanceModerations").all(),
    ).toEqual([]);
    expect(migrated.query("PRAGMA foreign_key_check").all()).toEqual([]);
    migrated.close();
  });
});
