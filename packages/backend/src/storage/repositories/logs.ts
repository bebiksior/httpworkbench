import type { Log } from "shared";
import { LogSchema } from "shared";
import { and, asc, desc, eq, gt, gte } from "drizzle-orm";
import { getDb } from "../db";
import { sendDiscordNotificationThrottled } from "../../server/webhooks";
import { getInstanceById } from "./instances";
import {
  isDiscordMutedForInstance,
  recordRequestAndMaybeTombstoneInTransaction,
} from "./moderation";
import { logs } from "../schema";
import { getWebhooksByIds } from "./webhooks";

const pendingWebhookNotifications = new Set<Promise<void>>();

const notifyWebhooks = async (log: Log, now: number): Promise<void> => {
  try {
    const instance = getInstanceById(log.instanceId);
    if (instance === undefined || instance.webhookIds.length === 0) {
      return;
    }
    if (isDiscordMutedForInstance(log.instanceId, now)) {
      return;
    }
    const webhooks = getWebhooksByIds(instance.webhookIds);
    await Promise.all(
      webhooks.map((webhook) => sendDiscordNotificationThrottled(webhook, log)),
    );
  } catch (error) {
    console.error("Error sending webhook notifications:", error);
  }
};
const trackWebhookNotification = (pending: Promise<void>) => {
  pendingWebhookNotifications.add(pending);
  void pending.finally(() => {
    pendingWebhookNotifications.delete(pending);
  });
};

export function addLog(log: Log): Log {
  const parsed = LogSchema.parse(log);
  const now = parsed.timestamp;
  const { tombstoned } = getDb().transaction(
    (tx) => {
      tx.insert(logs).values(parsed).run();
      return recordRequestAndMaybeTombstoneInTransaction(
        tx,
        parsed.instanceId,
        now,
      );
    },
    { behavior: "immediate" },
  );
  if (tombstoned) {
    return parsed;
  }

  trackWebhookNotification(notifyWebhooks(parsed, now));

  return parsed;
}

export async function flushPendingWebhookNotifications(): Promise<void> {
  while (pendingWebhookNotifications.size > 0) {
    await Promise.allSettled(Array.from(pendingWebhookNotifications));
  }
}

export function getLogsForInstance(instanceId: string): Log[] {
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
    .where(eq(logs.instanceId, instanceId))
    .orderBy(asc(logs.seq))
    .all();
}

export function getRecentLogsForInstance(
  instanceId: string,
  limit: number,
): Log[] {
  const rows = getDb()
    .select({
      id: logs.id,
      instanceId: logs.instanceId,
      type: logs.type,
      timestamp: logs.timestamp,
      address: logs.address,
      raw: logs.raw,
    })
    .from(logs)
    .where(eq(logs.instanceId, instanceId))
    .orderBy(desc(logs.seq))
    .limit(limit)
    .all();

  return rows.reverse();
}

export type LogsPageCursor = {
  seq: number;
};

type GetLogsPageInput = {
  instanceId: string;
  limit: number;
  cursor?: LogsPageCursor;
  type?: Log["type"];
  sinceTimestamp?: number;
};

type LogsPage = {
  logs: Log[];
  nextCursor?: LogsPageCursor;
};

export function getLogsForInstancePage(input: GetLogsPageInput): LogsPage {
  const filters = [eq(logs.instanceId, input.instanceId)];
  if (input.cursor !== undefined) {
    filters.push(gt(logs.seq, input.cursor.seq));
  }
  if (input.type !== undefined) {
    filters.push(eq(logs.type, input.type));
  }
  if (input.sinceTimestamp !== undefined) {
    filters.push(gte(logs.timestamp, input.sinceTimestamp));
  }

  const rows = getDb()
    .select({
      seq: logs.seq,
      id: logs.id,
      instanceId: logs.instanceId,
      type: logs.type,
      timestamp: logs.timestamp,
      address: logs.address,
      raw: logs.raw,
    })
    .from(logs)
    .where(and(...filters))
    .orderBy(asc(logs.seq))
    .limit(input.limit + 1)
    .all();

  const pageRows = rows.slice(0, input.limit);
  const lastRow = pageRows.at(-1);

  return {
    logs: pageRows.map(({ seq: _seq, ...log }) => log),
    nextCursor:
      rows.length > input.limit && lastRow !== undefined
        ? { seq: lastRow.seq }
        : undefined,
  };
}

export function clearLogsForInstance(instanceId: string): void {
  getDb().delete(logs).where(eq(logs.instanceId, instanceId)).run();
}
