import type { Webhook } from "shared";
import { WebhookSchema } from "shared";
import { db } from "../db";

export async function addWebhook(webhook: Webhook): Promise<Webhook> {
  WebhookSchema.parse(webhook);
  db.data.webhooks.push(webhook);
  await db.write();
  return webhook;
}

export async function getWebhooksByOwner(ownerId: string): Promise<Webhook[]> {
  return db.data.webhooks.filter((w) => w.ownerId === ownerId);
}

export async function getWebhookById(id: string): Promise<Webhook | undefined> {
  return db.data.webhooks.find((w) => w.id === id);
}

export async function updateWebhook(
  id: string,
  updates: { name: string; url: string },
): Promise<Webhook | undefined> {
  const webhook = db.data.webhooks.find((w) => w.id === id);
  if (webhook === undefined) {
    return undefined;
  }
  webhook.name = updates.name;
  webhook.url = updates.url;
  await db.write();
  return webhook;
}

export async function deleteWebhook(id: string): Promise<void> {
  const index = db.data.webhooks.findIndex((w) => w.id === id);
  if (index === -1) {
    return;
  }
  db.data.webhooks.splice(index, 1);

  db.data.instances = db.data.instances.map((instance) => ({
    ...instance,
    webhookIds: instance.webhookIds.filter((webhookId) => webhookId !== id),
  }));

  await db.write();
}

export async function getWebhooksByIds(ids: string[]): Promise<Webhook[]> {
  return db.data.webhooks.filter((w) => ids.includes(w.id));
}
