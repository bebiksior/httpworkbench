import { GUEST_OWNER_ID, type Instance, type InstanceSummary } from "shared";
import { InstanceSchema } from "shared";
import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import { getDb } from "../db";
import {
  toDomainInstance,
  toDomainInstanceSummary,
  toInstanceRow,
} from "../records";
import {
  guestInstanceCredentials,
  instances,
  instanceWebhooks,
} from "../schema";

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

export function addGuestInstance(
  instance: Instance,
  tokenHash: string,
): Instance {
  const parsed = InstanceSchema.parse(instance);
  if (parsed.ownerId !== GUEST_OWNER_ID || parsed.webhookIds.length !== 0) {
    throw new Error("Invalid guest instance");
  }
  getDb().transaction(
    (tx) => {
      tx.insert(instances).values(toInstanceRow(parsed)).run();
      tx.insert(guestInstanceCredentials)
        .values({ instanceId: parsed.id, tokenHash })
        .run();
    },
    { behavior: "immediate" },
  );
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
    })
    .from(instances)
    .where(
      and(eq(instances.ownerId, ownerId), activeInstanceCondition(Date.now())),
    )
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
    })
    .from(instances)
    .where(
      and(
        inArray(instances.id, ids),
        eq(instances.ownerId, ownerId),
        activeInstanceCondition(Date.now()),
      ),
    )
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

export function getActiveGuestCredentialHash(
  instanceId: string,
  now = Date.now(),
): string | undefined {
  return getDb()
    .select({ tokenHash: guestInstanceCredentials.tokenHash })
    .from(guestInstanceCredentials)
    .innerJoin(instances, eq(instances.id, guestInstanceCredentials.instanceId))
    .where(
      and(
        eq(guestInstanceCredentials.instanceId, instanceId),
        eq(instances.ownerId, GUEST_OWNER_ID),
        activeInstanceCondition(now),
      ),
    )
    .get()?.tokenHash;
}

export function getActiveGuestCredentialHashes(
  instanceIds: string[],
  now = Date.now(),
): Map<string, string> {
  if (instanceIds.length === 0) {
    return new Map();
  }
  const rows = getDb()
    .select({
      instanceId: guestInstanceCredentials.instanceId,
      tokenHash: guestInstanceCredentials.tokenHash,
    })
    .from(guestInstanceCredentials)
    .innerJoin(instances, eq(instances.id, guestInstanceCredentials.instanceId))
    .where(
      and(
        inArray(guestInstanceCredentials.instanceId, instanceIds),
        eq(instances.ownerId, GUEST_OWNER_ID),
        activeInstanceCondition(now),
      ),
    )
    .all();
  return new Map(rows.map((row) => [row.instanceId, row.tokenHash]));
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

export type ServableInstance = Pick<Instance, "id" | "raw">;

export type InstanceAccessMetadata = Pick<
  Instance,
  "id" | "ownerId" | "public"
>;

export function getServableInstanceById(
  id: string,
): ServableInstance | undefined {
  return getDb()
    .select({ id: instances.id, raw: instances.raw })
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
