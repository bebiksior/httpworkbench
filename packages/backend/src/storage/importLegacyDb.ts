import { isDeepStrictEqual } from "node:util";
import { asc } from "drizzle-orm";
import { closeDb, getDb, initDb, replaceData, resolveSqliteDbPath } from "./db";
import {
  readLegacyStorageData,
  resolveDataDir,
  resolveLegacyDbPath,
} from "./legacyData";
import {
  toDomainInstance,
  toDomainModeration,
  toDomainUserNotice,
} from "./records";
import {
  instanceModerations,
  instanceWebhooks,
  instances,
  logs,
  userNotices,
  users,
  webhooks,
} from "./schema";

const normalizeForComparison = <T>(value: T) => {
  return JSON.parse(JSON.stringify(value)) as T;
};

const compareStrings = (left: string, right: string) => {
  return left.localeCompare(right);
};

const sortById = <T extends { id: string }>(values: T[]) => {
  return [...values].sort((left, right) => compareStrings(left.id, right.id));
};

const sortByInstanceId = <T extends { instanceId: string }>(values: T[]) => {
  return [...values].sort((left, right) =>
    compareStrings(left.instanceId, right.instanceId),
  );
};

const hasStoredData = ({
  instancesLength,
  logsLength,
  userNoticesLength,
  usersLength,
  webhooksLength,
}: {
  instancesLength: number;
  logsLength: number;
  userNoticesLength: number;
  usersLength: number;
  webhooksLength: number;
}) => {
  return (
    instancesLength > 0 ||
    logsLength > 0 ||
    userNoticesLength > 0 ||
    usersLength > 0 ||
    webhooksLength > 0
  );
};

const assertImportedSectionMatches = <T>(
  label: string,
  actual: T,
  expected: T,
) => {
  if (
    !isDeepStrictEqual(
      normalizeForComparison(actual),
      normalizeForComparison(expected),
    )
  ) {
    throw new Error(`Imported ${label} mismatch`);
  }
};

const getWebhookIdsByInstanceId = () => {
  const rows = getDb()
    .select({
      instanceId: instanceWebhooks.instanceId,
      webhookId: instanceWebhooks.webhookId,
    })
    .from(instanceWebhooks)
    .orderBy(asc(instanceWebhooks.instanceId), asc(instanceWebhooks.position))
    .all();

  const webhookIdsByInstanceId = new Map<string, string[]>();
  for (const row of rows) {
    const existing = webhookIdsByInstanceId.get(row.instanceId);
    if (existing === undefined) {
      webhookIdsByInstanceId.set(row.instanceId, [row.webhookId]);
      continue;
    }
    existing.push(row.webhookId);
  }

  return webhookIdsByInstanceId;
};

const readImportedInstances = () => {
  const webhookIdsByInstanceId = getWebhookIdsByInstanceId();
  return getDb()
    .select()
    .from(instances)
    .all()
    .map((row) =>
      toDomainInstance(row, webhookIdsByInstanceId.get(row.id) ?? []),
    );
};

const readImportedLogs = () => {
  return getDb()
    .select({
      id: logs.id,
      instanceId: logs.instanceId,
      type: logs.type,
      timestamp: logs.timestamp,
      address: logs.address,
      raw: logs.raw,
    })
    .from(logs)
    .all();
};

const readImportedModerations = () => {
  return getDb()
    .select()
    .from(instanceModerations)
    .all()
    .map((row) => toDomainModeration(row));
};

const readImportedUserNotices = () => {
  return getDb()
    .select()
    .from(userNotices)
    .all()
    .map((row) => toDomainUserNotice(row));
};

export const verifyImportedData = (
  data: Awaited<ReturnType<typeof readLegacyStorageData>>,
  dataDir?: string,
) => {
  const statsResult = initDb({ dataDir });
  if (statsResult.kind === "error") {
    throw statsResult.error;
  }

  const { stats } = statsResult;
  if (stats.usersLength !== data.users.length) {
    throw new Error("Imported users count mismatch");
  }
  if (stats.instancesLength !== data.instances.length) {
    throw new Error("Imported instances count mismatch");
  }
  if (stats.logsLength !== data.logs.length) {
    throw new Error("Imported logs count mismatch");
  }
  if (stats.webhooksLength !== data.webhooks.length) {
    throw new Error("Imported webhooks count mismatch");
  }
  if (stats.userNoticesLength !== data.userNotices.length) {
    throw new Error("Imported user notices count mismatch");
  }

  assertImportedSectionMatches(
    "users",
    sortById(getDb().select().from(users).all()),
    sortById(data.users),
  );
  assertImportedSectionMatches(
    "instances",
    sortById(readImportedInstances()),
    sortById(data.instances),
  );
  assertImportedSectionMatches(
    "logs",
    sortById(readImportedLogs()),
    sortById(data.logs),
  );
  assertImportedSectionMatches(
    "webhooks",
    sortById(getDb().select().from(webhooks).all()),
    sortById(data.webhooks),
  );
  assertImportedSectionMatches(
    "instance moderations",
    sortByInstanceId(readImportedModerations()),
    sortByInstanceId(data.instanceModerations),
  );
  assertImportedSectionMatches(
    "user notices",
    sortById(readImportedUserNotices()),
    sortById(data.userNotices),
  );
};

export const runImportLegacyDb = async ({
  dataDir = resolveDataDir(),
  resetTarget = Bun.env.RESET_SQLITE === "1",
}: {
  dataDir?: string;
  resetTarget?: boolean;
} = {}) => {
  const sqlitePath = resolveSqliteDbPath(dataDir);

  if (!resetTarget) {
    const initResult = initDb({ dataDir });
    if (initResult.kind === "error") {
      throw initResult.error;
    }

    if (hasStoredData(initResult.stats)) {
      throw new Error(
        `Target SQLite database already contains data at ${sqlitePath}. Set RESET_SQLITE=1 to overwrite it.`,
      );
    }
  }

  const legacyData = await readLegacyStorageData(dataDir);
  const initResult = initDb({ dataDir, reset: resetTarget });
  if (initResult.kind === "error") {
    throw initResult.error;
  }

  replaceData(legacyData);
  verifyImportedData(legacyData, dataDir);

  return {
    sqlitePath,
    users: legacyData.users.length,
    instances: legacyData.instances.length,
    logs: legacyData.logs.length,
    webhooks: legacyData.webhooks.length,
    instanceModerations: legacyData.instanceModerations.length,
    userNotices: legacyData.userNotices.length,
  };
};

export const maybeAutoImportLegacyDb = async ({
  dataDir = resolveDataDir(),
}: {
  dataDir?: string;
} = {}) => {
  if (resolveLegacyDbPath(dataDir) === undefined) {
    return { kind: "skipped" as const, reason: "no-legacy-db" as const };
  }

  const initResult = initDb({ dataDir });
  if (initResult.kind === "error") {
    throw initResult.error;
  }

  if (hasStoredData(initResult.stats)) {
    return { kind: "skipped" as const, reason: "sqlite-has-data" as const };
  }

  return {
    kind: "imported" as const,
    result: await runImportLegacyDb({ dataDir, resetTarget: false }),
  };
};

if (import.meta.main) {
  runImportLegacyDb()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      closeDb();
    })
    .catch((error) => {
      closeDb();
      console.error(error);
      process.exit(1);
    });
}
