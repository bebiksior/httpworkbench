import {
  GUEST_OWNER_ID,
  type Instance,
  type InstanceInput,
  type InstanceRoute,
  type InstanceSummary,
} from "shared";
import { InstanceSchema } from "shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "../db";
import {
  toDomainInstance,
  toDomainInstanceSummary,
  toInstanceRow,
} from "../records";
import { instances, instanceWebhooks, logs } from "../schema";

const activeInstanceCondition = (now: number) =>
  or(isNull(instances.expiresAt), gt(instances.expiresAt, now));

type WebhookMutationStore = Pick<ReturnType<typeof getDb>, "delete" | "insert">;

const getActiveInstanceById = (
  id: string,
  now: number,
): Instance | undefined => {
  const row = getDb()
    .select()
    .from(instances)
    .where(and(eq(instances.id, id), activeInstanceCondition(now)))
    .get();
  return row === undefined
    ? undefined
    : toDomainInstance(row, getWebhookIdsForInstance(id));
};

const replaceInstanceWebhooks = (
  database: WebhookMutationStore,
  instanceId: string,
  webhookIds: string[],
) => {
  database
    .delete(instanceWebhooks)
    .where(eq(instanceWebhooks.instanceId, instanceId))
    .run();
  webhookIds.forEach((webhookId, position) => {
    database
      .insert(instanceWebhooks)
      .values({ instanceId, webhookId, position })
      .run();
  });
};

export function addInstance(instance: InstanceInput): Instance {
  const parsed = InstanceSchema.parse(instance);
  getDb().transaction(
    (tx) => {
      tx.insert(instances).values(toInstanceRow(parsed)).run();
      replaceInstanceWebhooks(tx, parsed.id, parsed.webhookIds);
    },
    { behavior: "immediate" },
  );
  return parsed;
}

export function addGuestInstance(instance: InstanceInput): Instance {
  const parsed = InstanceSchema.parse(instance);
  if (parsed.ownerId !== GUEST_OWNER_ID || parsed.webhookIds.length !== 0) {
    throw new Error("Invalid guest instance");
  }
  getDb().insert(instances).values(toInstanceRow(parsed)).run();
  return parsed;
}

export function getInstanceSummariesByOwner(
  ownerId: string,
): InstanceSummary[] {
  const rows = getDb()
    .select({
      id: instances.id,
      ownerId: instances.ownerId,
      createdAt: instances.createdAt,
      expiresAt: instances.expiresAt,
      label: instances.label,
      isPublic: instances.isPublic,
      isLocked: instances.isLocked,
      createdByApiKeyId: instances.createdByApiKeyId,
      logCount: count(logs.id),
    })
    .from(instances)
    .leftJoin(logs, eq(logs.instanceId, instances.id))
    .where(
      and(eq(instances.ownerId, ownerId), activeInstanceCondition(Date.now())),
    )
    .groupBy(instances.id)
    .orderBy(asc(instances.createdAt), asc(instances.id))
    .all();

  return rows.map(toDomainInstanceSummary);
}

export function getInstanceSummariesByIds(
  ids: string[],
  ownerId: string,
): InstanceSummary[] {
  if (ids.length === 0) {
    return [];
  }

  const rows = getDb()
    .select({
      id: instances.id,
      ownerId: instances.ownerId,
      createdAt: instances.createdAt,
      expiresAt: instances.expiresAt,
      label: instances.label,
      isPublic: instances.isPublic,
      isLocked: instances.isLocked,
      createdByApiKeyId: instances.createdByApiKeyId,
      logCount: count(logs.id),
    })
    .from(instances)
    .leftJoin(logs, eq(logs.instanceId, instances.id))
    .where(
      and(
        inArray(instances.id, ids),
        eq(instances.ownerId, ownerId),
        activeInstanceCondition(Date.now()),
      ),
    )
    .groupBy(instances.id)
    .all();

  const summariesById = new Map(
    rows.map((row) => {
      const summary = toDomainInstanceSummary(row);
      return [summary.id, summary] as const;
    }),
  );
  return ids.flatMap((id) => {
    const summary = summariesById.get(id);
    return summary === undefined ? [] : [summary];
  });
}

export function countActiveInstancesByOwner(ownerId: string): number {
  return (
    getDb()
      .select({ count: count() })
      .from(instances)
      .where(
        and(
          eq(instances.ownerId, ownerId),
          activeInstanceCondition(Date.now()),
        ),
      )
      .get()?.count ?? 0
  );
}

export function getInstanceById(id: string): Instance | undefined {
  return getActiveInstanceById(id, Date.now());
}

export type ServableInstance = {
  id: string;
  raw: string;
  routes: InstanceRoute[];
};

export type InstanceAccessMetadata = Pick<
  Instance,
  "id" | "ownerId" | "createdAt" | "public"
>;

export function getServableInstanceById(
  id: string,
): ServableInstance | undefined {
  return getDb()
    .select({
      id: instances.id,
      raw: instances.raw,
      routes: instances.routesJson,
    })
    .from(instances)
    .where(and(eq(instances.id, id), activeInstanceCondition(Date.now())))
    .get();
}

export function hasActiveInstance(id: string): boolean {
  return (
    getDb()
      .select({ id: instances.id })
      .from(instances)
      .where(and(eq(instances.id, id), activeInstanceCondition(Date.now())))
      .get() !== undefined
  );
}

export function getInstanceAccessMetadata(
  id: string,
): InstanceAccessMetadata | undefined {
  return getDb()
    .select({
      id: instances.id,
      ownerId: instances.ownerId,
      createdAt: instances.createdAt,
      public: instances.isPublic,
    })
    .from(instances)
    .where(and(eq(instances.id, id), activeInstanceCondition(Date.now())))
    .get();
}

export function getWebhookIdsForInstance(instanceId: string): string[] {
  return getDb()
    .select({ webhookId: instanceWebhooks.webhookId })
    .from(instanceWebhooks)
    .where(eq(instanceWebhooks.instanceId, instanceId))
    .orderBy(asc(instanceWebhooks.position))
    .all()
    .map(({ webhookId }) => webhookId);
}

export function getActiveWebhookIdsForInstance(
  instanceId: string,
  now = Date.now(),
): string[] {
  return getDb()
    .select({ webhookId: instanceWebhooks.webhookId })
    .from(instanceWebhooks)
    .innerJoin(instances, eq(instances.id, instanceWebhooks.instanceId))
    .where(
      and(
        eq(instanceWebhooks.instanceId, instanceId),
        activeInstanceCondition(now),
      ),
    )
    .orderBy(asc(instanceWebhooks.position))
    .all()
    .map(({ webhookId }) => webhookId);
}

export function updateInstance(
  id: string,
  updater: (instance: Instance) => Instance,
): Instance | undefined {
  const current = getActiveInstanceById(id, Date.now());
  if (current === undefined) {
    return undefined;
  }

  const updated = updater(current);
  const parsed = InstanceSchema.parse(updated);
  getDb().transaction(
    (tx) => {
      tx.update(instances)
        .set(toInstanceRow(parsed))
        .where(eq(instances.id, id))
        .run();
      replaceInstanceWebhooks(tx, id, parsed.webhookIds);
    },
    { behavior: "immediate" },
  );
  return parsed;
}

export function deleteInstance(id: string): void {
  getDb().delete(instances).where(eq(instances.id, id)).run();
}

export type InstanceFilters = {
  query?: string;
  labelPrefix?: string;
  createdAfter?: number;
  createdBefore?: number;
  hasLogs?: boolean;
  maxLogCount?: number;
  locked?: boolean;
  createdByApiKeyId?: string;
};

const logCountExpression = sql<number>`(select count(*) from ${logs} where ${logs.instanceId} = ${instances.id})`;

const instanceFilterConditions = (
  ownerId: string,
  filters: InstanceFilters,
  now: number,
): SQL[] => {
  const conditions: (SQL | undefined)[] = [
    eq(instances.ownerId, ownerId),
    activeInstanceCondition(now),
  ];
  const query = filters.query?.trim().toLowerCase();
  if (query !== undefined && query !== "") {
    conditions.push(
      or(
        sql`instr(lower(${instances.label}), ${query}) > 0`,
        sql`instr(${instances.id}, ${query}) > 0`,
      ),
    );
  }
  if (filters.labelPrefix !== undefined && filters.labelPrefix !== "") {
    conditions.push(sql`instr(${instances.label}, ${filters.labelPrefix}) = 1`);
  }
  if (filters.createdAfter !== undefined) {
    conditions.push(gte(instances.createdAt, filters.createdAfter));
  }
  if (filters.createdBefore !== undefined) {
    conditions.push(lt(instances.createdAt, filters.createdBefore));
  }
  if (filters.hasLogs !== undefined) {
    conditions.push(
      filters.hasLogs
        ? sql`${logCountExpression} > 0`
        : sql`${logCountExpression} = 0`,
    );
  }
  if (filters.maxLogCount !== undefined) {
    conditions.push(sql`${logCountExpression} <= ${filters.maxLogCount}`);
  }
  if (filters.locked !== undefined) {
    conditions.push(eq(instances.isLocked, filters.locked));
  }
  if (filters.createdByApiKeyId !== undefined) {
    conditions.push(eq(instances.createdByApiKeyId, filters.createdByApiKeyId));
  }
  return conditions.filter((condition) => condition !== undefined);
};

export type InstanceListCursor = { createdAt: number; id: string };

export function listInstanceSummaries(input: {
  ownerId: string;
  filters: InstanceFilters;
  limit: number;
  after?: InstanceListCursor;
}): { instances: InstanceSummary[]; total: number; next?: InstanceListCursor } {
  const now = Date.now();
  const conditions = instanceFilterConditions(
    input.ownerId,
    input.filters,
    now,
  );
  const total =
    getDb()
      .select({ count: count() })
      .from(instances)
      .where(and(...conditions))
      .get()?.count ?? 0;
  const pageConditions =
    input.after === undefined
      ? conditions
      : [
          ...conditions,
          or(
            lt(instances.createdAt, input.after.createdAt),
            and(
              eq(instances.createdAt, input.after.createdAt),
              lt(instances.id, input.after.id),
            ),
          ),
        ];
  const rows = getDb()
    .select({
      id: instances.id,
      ownerId: instances.ownerId,
      createdAt: instances.createdAt,
      expiresAt: instances.expiresAt,
      label: instances.label,
      isPublic: instances.isPublic,
      isLocked: instances.isLocked,
      createdByApiKeyId: instances.createdByApiKeyId,
      logCount: logCountExpression,
    })
    .from(instances)
    .where(and(...pageConditions))
    .orderBy(desc(instances.createdAt), desc(instances.id))
    .limit(input.limit + 1)
    .all();
  const page = rows.slice(0, input.limit).map(toDomainInstanceSummary);
  const last = page[page.length - 1];
  return {
    instances: page,
    total,
    next:
      rows.length > input.limit && last !== undefined
        ? { createdAt: last.createdAt, id: last.id }
        : undefined,
  };
}

export function deleteUnlockedInstancesMatching(input: {
  ownerId: string;
  filters: InstanceFilters;
  dryRun?: boolean;
}): string[] {
  const conditions = [
    ...instanceFilterConditions(input.ownerId, input.filters, Date.now()),
    eq(instances.isLocked, false),
  ];
  if (input.dryRun === true) {
    return getDb()
      .select({ id: instances.id })
      .from(instances)
      .where(and(...conditions))
      .orderBy(asc(instances.createdAt), asc(instances.id))
      .all()
      .map(({ id }) => id);
  }
  return getDb()
    .delete(instances)
    .where(and(...conditions))
    .returning({ id: instances.id })
    .all()
    .map(({ id }) => id);
}

export function removeUnusedApiKeyInstances(createdBefore: number): string[] {
  return getDb()
    .delete(instances)
    .where(
      and(
        isNotNull(instances.createdByApiKeyId),
        lt(instances.createdAt, createdBefore),
        eq(instances.isLocked, false),
        eq(instances.isPublic, false),
        ne(instances.ownerId, GUEST_OWNER_ID),
        sql`${logCountExpression} = 0`,
      ),
    )
    .returning({ id: instances.id })
    .all()
    .map(({ id }) => id);
}

export function removeExpiredInstances(now: number): string[] {
  const expiredCondition = and(
    isNotNull(instances.expiresAt),
    lte(instances.expiresAt, now),
  );
  const rows = getDb()
    .select({ id: instances.id })
    .from(instances)
    .where(expiredCondition)
    .orderBy(asc(instances.expiresAt), asc(instances.id))
    .all();

  const removedIds = rows.map((row) => row.id);
  if (removedIds.length === 0) {
    return [];
  }

  getDb().delete(instances).where(expiredCondition).run();

  return removedIds;
}
