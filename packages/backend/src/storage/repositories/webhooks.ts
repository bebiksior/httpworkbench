import type { Webhook } from "shared";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { toDomainWebhook, toWebhookRow } from "../records";
import { webhooks } from "../schema";

export function addWebhook(webhook: Webhook): Webhook {
  const row = toWebhookRow(webhook);
  getDb().insert(webhooks).values(row).run();
  return webhook;
}

export function getWebhooksByOwner(ownerId: string): Webhook[] {
  return getDb()
    .select()
    .from(webhooks)
    .where(eq(webhooks.ownerId, ownerId))
    .orderBy(asc(webhooks.createdAt), asc(webhooks.id))
    .all()
    .map((row) => toDomainWebhook(row));
}

export function getWebhookById(id: string): Webhook | undefined {
  const row = getDb().select().from(webhooks).where(eq(webhooks.id, id)).get();
  return row === undefined ? undefined : toDomainWebhook(row);
}

export function updateWebhook(
  id: string,
  updates: { name: string; url: string; message?: string },
): Webhook | undefined {
  const current = getWebhookById(id);
  if (current === undefined) {
    return undefined;
  }

  const next = {
    ...current,
    name: updates.name,
    url: updates.url,
    message: updates.message,
  };

  getDb()
    .update(webhooks)
    .set({
      name: next.name,
      url: next.url,
      message: next.message ?? null,
    })
    .where(eq(webhooks.id, id))
    .run();

  return next;
}

export function deleteWebhook(id: string): void {
  getDb().delete(webhooks).where(eq(webhooks.id, id)).run();
}

export function getWebhooksByIds(ids: string[]): Webhook[] {
  if (ids.length === 0) {
    return [];
  }

  const rows = getDb()
    .select()
    .from(webhooks)
    .where(inArray(webhooks.id, ids))
    .all()
    .map((row) => toDomainWebhook(row));

  const webhooksById = new Map(
    rows.map((row) => {
      return [row.id, row] as const;
    }),
  );

  return ids.flatMap((id) => {
    const webhook = webhooksById.get(id);
    return webhook === undefined ? [] : [webhook];
  });
}
