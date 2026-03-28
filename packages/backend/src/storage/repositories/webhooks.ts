import type { Webhook } from "shared";
import { WebhookSchema } from "shared";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { webhooks } from "../schema";

export function addWebhook(webhook: Webhook): Webhook {
  const parsed = WebhookSchema.parse(webhook);
  getDb().insert(webhooks).values(parsed).run();
  return parsed;
}

export function getWebhooksByOwner(ownerId: string): Webhook[] {
  return getDb()
    .select()
    .from(webhooks)
    .where(eq(webhooks.ownerId, ownerId))
    .orderBy(asc(webhooks.createdAt), asc(webhooks.id))
    .all();
}

export function getWebhookById(id: string): Webhook | undefined {
  return getDb().select().from(webhooks).where(eq(webhooks.id, id)).get();
}

export function updateWebhook(
  id: string,
  updates: { name: string; url: string },
): Webhook | undefined {
  const current = getWebhookById(id);
  if (current === undefined) {
    return undefined;
  }

  const next = {
    ...current,
    name: updates.name,
    url: updates.url,
  };

  getDb()
    .update(webhooks)
    .set({ name: next.name, url: next.url })
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
    .all();

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
