import type { Log } from "shared";
import { LogSchema } from "shared";
import { db, scheduleDbWrite } from "../db";
import { sendDiscordNotificationThrottled } from "../../server/webhooks";
import { getInstanceByIdSync } from "./instances";
import {
  isDiscordMutedForInstance,
  recordRequestAndMaybeTombstone,
} from "./moderation";
import { getWebhooksByIds } from "./webhooks";

const notifyWebhooks = async (log: Log, now: number) => {
  try {
    const instance = getInstanceByIdSync(log.instanceId);
    if (instance === undefined || instance.webhookIds.length === 0) {
      return;
    }
    if (isDiscordMutedForInstance(log.instanceId, now)) {
      return;
    }
    const webhooks = await getWebhooksByIds(instance.webhookIds);
    await Promise.all(
      webhooks.map((webhook) => sendDiscordNotificationThrottled(webhook, log)),
    );
  } catch (error) {
    console.error("Error sending webhook notifications:", error);
  }
};

export function addLog(log: Log): Log {
  LogSchema.parse(log);
  db.data.logs.push(log);
  const now = log.timestamp;

  const { tombstoned } = recordRequestAndMaybeTombstone(log.instanceId, now);
  scheduleDbWrite();
  if (tombstoned) {
    return log;
  }

  void notifyWebhooks(log, now);

  return log;
}

export async function getLogsForInstance(instanceId: string): Promise<Log[]> {
  return db.data.logs.filter((l) => l.instanceId === instanceId);
}

export async function clearLogsForInstance(instanceId: string): Promise<void> {
  db.data.logs = db.data.logs.filter((l) => l.instanceId !== instanceId);
  await db.write();
}
