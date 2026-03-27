import type { Log } from "shared";
import { LogSchema } from "shared";
import { db } from "../db";
import { sendDiscordNotificationThrottled } from "../../server/webhooks";
import { getInstanceById } from "./instances";
import {
  isDiscordMutedForInstance,
  recordRequestAndMaybeTombstone,
} from "./moderation";
import { getWebhooksByIds } from "./webhooks";

export async function addLog(log: Log): Promise<Log> {
  LogSchema.parse(log);
  db.data.logs.push(log);
  await db.write();

  const now = Date.now();
  const { tombstoned } = await recordRequestAndMaybeTombstone(
    log.instanceId,
    now,
  );
  if (tombstoned) {
    return log;
  }

  try {
    const instance = await getInstanceById(log.instanceId);
    if (instance === undefined || instance.webhookIds.length === 0) {
      return log;
    }
    if (isDiscordMutedForInstance(log.instanceId, now)) {
      return log;
    }
    const webhooks = await getWebhooksByIds(instance.webhookIds);
    await Promise.all(
      webhooks.map((webhook) => sendDiscordNotificationThrottled(webhook, log)),
    );
  } catch (error) {
    console.error("Error sending webhook notifications:", error);
  }

  return log;
}

export async function getLogsForInstance(instanceId: string): Promise<Log[]> {
  return db.data.logs.filter((l) => l.instanceId === instanceId);
}

export async function clearLogsForInstance(instanceId: string): Promise<void> {
  db.data.logs = db.data.logs.filter((l) => l.instanceId !== instanceId);
  await db.write();
}
