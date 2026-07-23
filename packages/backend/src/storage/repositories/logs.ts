import type { Log } from "shared";
import { LogSchema } from "shared";
import { and, asc, desc, eq, gt, gte, lt } from "drizzle-orm";
import { getDb } from "../db";
import {
  flushDiscordNotificationQueue,
  queueDiscordNotification,
} from "../../server/webhooks";
import { getActiveWebhookIdsForInstance } from "./instances";
import {
  isDiscordMutedForInstance,
  recordRequestAndMaybeTombstoneInTransaction,
} from "./moderation";
import { logs } from "../schema";
import { getWebhooksByIds } from "./webhooks";

const notifyWebhooks = (log: Log, now: number): void => {
  try {
    const webhookIds = getActiveWebhookIdsForInstance(log.instanceId, now);
    if (webhookIds.length === 0) {
      return;
    }
    if (isDiscordMutedForInstance(log.instanceId, now)) {
      return;
    }
    const webhooks = getWebhooksByIds(webhookIds);
    for (const webhook of webhooks) {
      queueDiscordNotification(webhook, log);
    }
  } catch (error) {
    console.error("Error sending webhook notifications:", error);
  }
};

export type AddLogOutcome = { log: Log; tombstoned: boolean };

export function addLogWithOutcome(log: Log): AddLogOutcome {
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
    return { log: parsed, tombstoned: true };
  }

  notifyWebhooks(parsed, now);

  return { log: parsed, tombstoned: false };
}

export function addLog(log: Log): Log {
  return addLogWithOutcome(log).log;
}

export async function flushPendingWebhookNotifications(): Promise<void> {
  await flushDiscordNotificationQueue();
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
  return getRecentLogsForInstancePage({ instanceId, limit }).logs;
}

type GetRecentLogsPageInput = {
  instanceId: string;
  limit: number;
  before?: LogsPageCursor;
  type?: Log["type"];
};

type RecentLogsPage = {
  logs: Log[];
  olderCursor?: LogsPageCursor;
};

export function getRecentLogsForInstancePage(
  input: GetRecentLogsPageInput,
): RecentLogsPage {
  const filters = [eq(logs.instanceId, input.instanceId)];
  if (input.before !== undefined) {
    filters.push(lt(logs.seq, input.before.seq));
  }
  if (input.type !== undefined) {
    filters.push(eq(logs.type, input.type));
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
    .orderBy(desc(logs.seq))
    .limit(input.limit + 1)
    .all();

  const pageRows = rows.slice(0, input.limit);
  const oldestIncluded = pageRows.at(-1);
  return {
    logs: pageRows.map(({ seq: _seq, ...log }) => log).reverse(),
    olderCursor:
      rows.length > input.limit && oldestIncluded !== undefined
        ? { seq: oldestIncluded.seq }
        : undefined,
  };
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
  resumeCursor?: LogsPageCursor;
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
    resumeCursor:
      lastRow === undefined
        ? input.cursor
        : {
            seq: lastRow.seq,
          },
    nextCursor:
      rows.length > input.limit && lastRow !== undefined
        ? { seq: lastRow.seq }
        : undefined,
  };
}

export function clearLogsForInstance(instanceId: string): void {
  getDb().delete(logs).where(eq(logs.instanceId, instanceId)).run();
}
