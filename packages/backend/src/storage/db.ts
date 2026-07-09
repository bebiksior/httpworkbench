import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
  instances,
  apiKeys,
  logs,
  schema,
  userNotices,
  users,
  webhooks,
} from "./schema";

const SQLITE_DB_FILENAME = "db.sqlite";
const MIGRATIONS_FOLDER = `${import.meta.dir}/../../drizzle`;

const resolveDataDir = (dataDir?: string) =>
  dataDir ?? Bun.env.DATA_DIR ?? path.join(process.cwd(), "data");

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

const countAppliedMigrations = (sqlite: Database) => {
  const migrationsTable = sqlite
    .query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get();
  if (migrationsTable === null) {
    return 0;
  }

  return (
    sqlite
      .query<
        { count: number },
        []
      >("SELECT COUNT(*) AS count FROM __drizzle_migrations")
      .get()?.count ?? 0
  );
};

const openDatabase = (dbPath: string) => {
  const sqlite = new Database(dbPath, { strict: true });
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA synchronous = NORMAL");
  sqlite.run("PRAGMA busy_timeout = 5000");
  const db = createDrizzleDb(sqlite);
  try {
    // Table-rebuild migrations must run with foreign keys disabled at the
    // connection level; changing this pragma inside Drizzle's transaction is
    // ignored by SQLite.
    sqlite.run("PRAGMA foreign_keys = OFF");
    const migrationCountBefore = countAppliedMigrations(sqlite);
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    sqlite.run("PRAGMA foreign_keys = ON");
    const migrationCountAfter = countAppliedMigrations(sqlite);
    if (migrationCountAfter > migrationCountBefore) {
      const violations = sqlite.query("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        throw new Error(
          `Database migration produced foreign key violations: ${JSON.stringify(violations)}`,
        );
      }
    }
    return { sqlite, db };
  } catch (error) {
    sqlite.close();
    throw error;
  }
};

const getStats = (db: DrizzleDb) => {
  const usersCount = db.select({ count: count() }).from(users).get();
  const instancesCount = db.select({ count: count() }).from(instances).get();
  const logsCount = db.select({ count: count() }).from(logs).get();
  const webhooksCount = db.select({ count: count() }).from(webhooks).get();
  const apiKeysCount = db.select({ count: count() }).from(apiKeys).get();
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
    apiKeysLength: apiKeysCount?.count ?? 0,
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
