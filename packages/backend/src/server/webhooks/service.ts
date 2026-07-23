import type { Log, Webhook } from "shared";
import { abusePolicy } from "../../config/abuse";
import { createBoundedProtocolRateLimiter } from "../protocolRateLimit";
import {
  buildDiscordNotificationPayload,
  type DiscordLogBatchSummary,
  validateDiscordWebhookUrl,
} from "./discord";

const discordRequestTimeoutMs = 10_000;
const maxPendingDiscordBatches = 10_000;
const maxConcurrentDiscordRequests = 16;
let activeDiscordRequests = 0;
const discordInstanceRateLimit = createBoundedProtocolRateLimiter({
  maxRequests: abusePolicy.discordWebhookLimitPerMinutePerInstance,
  windowMs: abusePolicy.minuteBucketMs,
  maxEntries: maxPendingDiscordBatches,
});
const discordLogPriority: Record<Log["type"], number> = {
  dns: 0,
  smtp: 1,
  http: 2,
};
type PendingDiscordBatch = {
  webhook: Webhook;
  representativeLog: Log;
  summary: DiscordLogBatchSummary;
  timeout: ReturnType<typeof setTimeout>;
};
const pendingDiscordBatches = new Map<string, PendingDiscordBatch>();
const activeDiscordNotifications = new Set<Promise<void>>();
const EXAMPLE_DISCORD_LOG: Log = {
  id: "test-log",
  instanceId: "example-instance",
  type: "http",
  timestamp: Date.UTC(2026, 3, 12, 12, 0, 0),
  address: "203.0.113.10",
  raw: [
    "GET /example HTTP/1.1",
    "Host: example.httpworkbench.dev",
    "User-Agent: webhook-test-button",
    "X-Test: true",
  ].join("\n"),
};

export function resetDiscordNotificationStateForTests(): void {
  for (const batch of pendingDiscordBatches.values()) {
    clearTimeout(batch.timeout);
  }
  pendingDiscordBatches.clear();
  discordInstanceRateLimit.reset();
}

const postDiscordNotification = async (
  webhook: Webhook,
  log: Log,
  batch?: DiscordLogBatchSummary,
): Promise<void> => {
  const validation = validateDiscordWebhookUrl(webhook.url);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid webhook URL");
  }

  if (activeDiscordRequests >= maxConcurrentDiscordRequests) {
    throw new Error("Discord webhook concurrency limit reached");
  }
  activeDiscordRequests += 1;

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildDiscordNotificationPayload(log, webhook.message, batch),
      ),
      redirect: "error",
      signal: AbortSignal.timeout(discordRequestTimeoutMs),
    });

    await response.body?.cancel();
    if (!response.ok) {
      throw new Error(
        `Discord webhook request failed: ${response.status} ${response.statusText}`,
      );
    }
  } finally {
    activeDiscordRequests -= 1;
  }
};

export async function sendDiscordNotification(
  webhook: Webhook,
  log: Log,
  batch?: DiscordLogBatchSummary,
): Promise<void> {
  try {
    await postDiscordNotification(webhook, log, batch);
  } catch (error) {
    console.error(
      `Error sending Discord notification to webhook ${webhook.id}:`,
      error,
    );
  }
}

export async function sendDiscordTestNotification(input: {
  url: string;
  message?: string;
}): Promise<void> {
  await postDiscordNotification(
    {
      id: "test-webhook",
      name: "Test webhook",
      url: input.url,
      message: input.message,
      ownerId: "test-user",
      createdAt: 0,
    },
    EXAMPLE_DISCORD_LOG,
  );
}

const trackDiscordNotification = (notification: Promise<void>) => {
  activeDiscordNotifications.add(notification);
  notification.finally(() => activeDiscordNotifications.delete(notification));
  return notification;
};

const deliverPendingDiscordBatch = (
  webhookId: string,
  expectedBatch: PendingDiscordBatch,
) => {
  const batch = pendingDiscordBatches.get(webhookId);
  if (batch !== expectedBatch) {
    return Promise.resolve();
  }

  clearTimeout(batch.timeout);
  pendingDiscordBatches.delete(webhookId);
  return trackDiscordNotification(
    sendDiscordNotification(
      batch.webhook,
      batch.representativeLog,
      batch.summary,
    ),
  );
};

const addToPendingDiscordBatch = (
  batch: PendingDiscordBatch,
  webhook: Webhook,
  log: Log,
) => {
  batch.webhook = webhook;
  batch.summary.total += 1;
  batch.summary.counts[log.type] += 1;

  const currentPriority = discordLogPriority[batch.representativeLog.type];
  const nextPriority = discordLogPriority[log.type];
  if (
    nextPriority > currentPriority ||
    (nextPriority === currentPriority &&
      log.timestamp >= batch.representativeLog.timestamp)
  ) {
    batch.representativeLog = log;
  }
};

export function queueDiscordNotification(webhook: Webhook, log: Log): boolean {
  const pending = pendingDiscordBatches.get(webhook.id);
  if (pending !== undefined) {
    addToPendingDiscordBatch(pending, webhook, log);
    return true;
  }

  if (pendingDiscordBatches.size >= maxPendingDiscordBatches) {
    return false;
  }

  const now = Date.now();
  if (!discordInstanceRateLimit.check(log.instanceId, now)) {
    return false;
  }

  const batch: PendingDiscordBatch = {
    webhook,
    representativeLog: log,
    summary: {
      total: 1,
      counts: {
        dns: log.type === "dns" ? 1 : 0,
        http: log.type === "http" ? 1 : 0,
        smtp: log.type === "smtp" ? 1 : 0,
      },
    },
    timeout: setTimeout(() => {
      void deliverPendingDiscordBatch(webhook.id, batch);
    }, abusePolicy.discordWebhookDebounceMs),
  };
  pendingDiscordBatches.set(webhook.id, batch);
  return true;
}

export async function flushDiscordNotificationQueue(): Promise<void> {
  while (
    pendingDiscordBatches.size > 0 ||
    activeDiscordNotifications.size > 0
  ) {
    const pending = Array.from(pendingDiscordBatches.entries());
    const deliveries = pending.map(([webhookId, batch]) =>
      deliverPendingDiscordBatch(webhookId, batch),
    );
    await Promise.allSettled([...deliveries, ...activeDiscordNotifications]);
  }
}
