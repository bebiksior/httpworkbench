import type { Instance } from "shared";
import { InstanceSchema } from "shared";
import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../db";
import { toDomainInstance, toInstanceRow } from "../records";
import { instances, instanceWebhooks } from "../schema";

const isInstanceExpired = (instance: Instance, now: number) => {
  return instance.expiresAt !== undefined && instance.expiresAt <= now;
};

type WebhookMutationStore = Pick<ReturnType<typeof getDb>, "delete" | "insert">;

const getWebhookIdsByInstanceId = (instanceIds: string[]) => {
  if (instanceIds.length === 0) {
    return new Map<string, string[]>();
  }

  const rows = getDb()
    .select({
      instanceId: instanceWebhooks.instanceId,
      webhookId: instanceWebhooks.webhookId,
    })
    .from(instanceWebhooks)
    .where(inArray(instanceWebhooks.instanceId, instanceIds))
    .orderBy(asc(instanceWebhooks.instanceId), asc(instanceWebhooks.position))
    .all();

  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const current = grouped.get(row.instanceId);
    if (current === undefined) {
      grouped.set(row.instanceId, [row.webhookId]);
      continue;
    }
    current.push(row.webhookId);
  }

  return grouped;
};

const hydrateInstances = (
  rows: Array<typeof instances.$inferSelect>,
): Instance[] => {
  const webhookIdsByInstanceId = getWebhookIdsByInstanceId(
    rows.map((row) => row.id),
  );

  return rows.map((row) =>
    toDomainInstance(row, webhookIdsByInstanceId.get(row.id) ?? []),
  );
};

const getActiveInstanceById = (
  id: string,
  now: number,
): Instance | undefined => {
  const row = getDb()
    .select()
    .from(instances)
    .where(eq(instances.id, id))
    .get();
  const instance = row === undefined ? undefined : hydrateInstances([row])[0];
  if (instance === undefined) {
    return undefined;
  }
  return isInstanceExpired(instance, now) ? undefined : instance;
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

export function addInstance(instance: Instance): Instance {
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

export function getInstancesByOwner(ownerId: string): Instance[] {
  const now = Date.now();
  return hydrateInstances(
    getDb()
      .select()
      .from(instances)
      .where(eq(instances.ownerId, ownerId))
      .orderBy(asc(instances.createdAt), asc(instances.id))
      .all(),
  ).filter((instance) => !isInstanceExpired(instance, now));
}

export function getInstanceById(id: string): Instance | undefined {
  return getActiveInstanceById(id, Date.now());
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
