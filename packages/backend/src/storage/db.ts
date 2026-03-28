import { existsSync, mkdirSync, rmSync } from "node:fs";
import { Database } from "bun:sqlite";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { LegacyStorageData } from "./legacyData";
import { resolveDataDir } from "./legacyData";
import {
  instanceWebhooks,
  instanceModerations,
  instances,
  logs,
  schema,
  userNotices,
  users,
  webhooks,
} from "./schema";
import { toInstanceRow, toModerationRow, toUserNoticeRow } from "./records";

const SQLITE_DB_FILENAME = "db.sqlite";
const MIGRATIONS_FOLDER = `${import.meta.dir}/../../drizzle`;

type InitDbOptions = {
  dataDir?: string;
  reset?: boolean;
};

const createDrizzleDb = (sqlite: Database) => {
  return drizzle({ client: sqlite, schema });
};

type DrizzleDb = ReturnType<typeof createDrizzleDb>;

type DbState = {
  sqlite: Database;
  db: DrizzleDb;
  dataDir: string;
  dbPath: string;
};

let dbState: DbState | undefined;

const openDatabase = (dbPath: string) => {
  const sqlite = new Database(dbPath, { strict: true });
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA synchronous = NORMAL");
  sqlite.run("PRAGMA busy_timeout = 5000");
  const db = createDrizzleDb(sqlite);
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { sqlite, db };
};

const getStats = (db: DrizzleDb) => {
  const usersCount = db.select({ count: count() }).from(users).get();
  const instancesCount = db.select({ count: count() }).from(instances).get();
  const logsCount = db.select({ count: count() }).from(logs).get();
  const webhooksCount = db.select({ count: count() }).from(webhooks).get();
  const userNoticesCount = db
    .select({ count: count() })
    .from(userNotices)
    .get();

  return {
    instancesLength: instancesCount?.count ?? 0,
    logsLength: logsCount?.count ?? 0,
    userNoticesLength: userNoticesCount?.count ?? 0,
    usersLength: usersCount?.count ?? 0,
    webhooksLength: webhooksCount?.count ?? 0,
  };
};

export const resolveSqliteDbPath = (dataDir?: string) => {
  return `${resolveDataDir(dataDir)}/${SQLITE_DB_FILENAME}`;
};

const initializeState = (options: InitDbOptions = {}) => {
  const dataDir = resolveDataDir(options.dataDir);
  mkdirSync(dataDir, { recursive: true });

  const dbPath = resolveSqliteDbPath(dataDir);
  if (options.reset === true && existsSync(dbPath)) {
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
  }

  const existingState = dbState;
  if (existingState?.dbPath === dbPath && options.reset !== true) {
    return existingState;
  }

  if (existingState !== undefined) {
    existingState.sqlite.close();
  }

  const { sqlite, db } = openDatabase(dbPath);
  const nextState = { sqlite, db, dataDir, dbPath };
  dbState = nextState;
  return nextState;
};

export const initDb = (options: InitDbOptions = {}) => {
  try {
    const { db } = initializeState(options);
    return {
      kind: "ok" as const,
      stats: getStats(db),
    };
  } catch (error) {
    return {
      kind: "error" as const,
      error:
        error instanceof Error ? error : new Error("Failed to initialize db"),
    };
  }
};

export const closeDb = () => {
  const currentState = dbState;
  if (currentState === undefined) {
    return;
  }

  currentState.sqlite.close();
  dbState = undefined;
};

export const getDb = () => {
  const initialized =
    dbState ??
    (() => {
      const result = initDb();
      if (result.kind === "error") {
        throw result.error;
      }
      const currentState = dbState;
      if (currentState === undefined) {
        throw new Error("Database did not initialize");
      }
      return currentState;
    })();

  return initialized.db;
};

export const replaceData = (data: LegacyStorageData) => {
  const db = getDb();

  db.transaction(
    (tx) => {
      tx.delete(logs).run();
      tx.delete(instanceWebhooks).run();
      tx.delete(instanceModerations).run();
      tx.delete(userNotices).run();
      tx.delete(webhooks).run();
      tx.delete(instances).run();
      tx.delete(users).run();

      for (const user of data.users) {
        tx.insert(users).values(user).run();
      }

      for (const webhook of data.webhooks) {
        tx.insert(webhooks).values(webhook).run();
      }

      for (const instance of data.instances) {
        tx.insert(instances).values(toInstanceRow(instance)).run();
        instance.webhookIds.forEach((webhookId, position) => {
          tx.insert(instanceWebhooks)
            .values({
              instanceId: instance.id,
              webhookId,
              position,
            })
            .run();
        });
      }

      for (const log of data.logs) {
        tx.insert(logs).values(log).run();
      }

      for (const moderation of data.instanceModerations) {
        tx.insert(instanceModerations)
          .values(toModerationRow(moderation))
          .run();
      }

      for (const notice of data.userNotices) {
        tx.insert(userNotices).values(toUserNoticeRow(notice)).run();
      }
    },
    {
      behavior: "immediate",
    },
  );
};
