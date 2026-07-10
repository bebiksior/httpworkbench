import type { Log, Webhook } from "shared";
import { abusePolicy } from "../../config/abuse";
import { createBoundedProtocolRateLimiter } from "../protocolRateLimit";
import {
  buildDiscordNotificationPayload,
  validateDiscordWebhookUrl,
} from "./discord";

const webhookMinIntervalMs = 1000;
const discordRequestTimeoutMs = 10_000;
const maxDiscordThrottleEntries = 10_000;
const discordWebhookRateLimit = createBoundedProtocolRateLimiter({
  maxRequests: 1,
  windowMs: webhookMinIntervalMs,
  maxEntries: maxDiscordThrottleEntries,
});
const discordInstanceRateLimit = createBoundedProtocolRateLimiter({
  maxRequests: abusePolicy.discordWebhookLimitPerMinutePerInstance,
  windowMs: abusePolicy.minuteBucketMs,
  maxEntries: maxDiscordThrottleEntries,
});
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

export function resetDiscordNotificationThrottleStateForTests(): void {
  discordWebhookRateLimit.reset();
  discordInstanceRateLimit.reset();
}

const postDiscordNotification = async (
  webhook: Webhook,
  log: Log,
): Promise<void> => {
  const validation = validateDiscordWebhookUrl(webhook.url);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid webhook URL");
  }

  const response = await fetch(webhook.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildDiscordNotificationPayload(log, webhook.message)),
    redirect: "error",
    signal: AbortSignal.timeout(discordRequestTimeoutMs),
  });

  await response.body?.cancel();
  if (!response.ok) {
    throw new Error(
      `Discord webhook request failed: ${response.status} ${response.statusText}`,
    );
  }
};

export async function sendDiscordNotification(
  webhook: Webhook,
  log: Log,
): Promise<void> {
  try {
    await postDiscordNotification(webhook, log);
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

export async function sendDiscordNotificationThrottled(
  webhook: Webhook,
  log: Log,
): Promise<void> {
  const now = Date.now();
  if (!discordWebhookRateLimit.canCheck(webhook.id, now)) {
    return;
  }
  if (!discordInstanceRateLimit.check(log.instanceId, now)) {
    return;
  }
  discordWebhookRateLimit.check(webhook.id, now);
  await sendDiscordNotification(webhook, log);
}
