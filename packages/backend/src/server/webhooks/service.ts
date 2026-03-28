import type { Log, Webhook } from "shared";
import { abusePolicy } from "../../config/abuse";
import {
  buildDiscordNotificationPayload,
  validateDiscordWebhookUrl,
} from "./discord";

const webhookMinIntervalMs = 1000;
const lastDiscordSendByWebhookId = new Map<string, number>();

type DiscordWebhookInstanceBucket = {
  minuteStartMs: number;
  sendsInMinute: number;
};

const discordWebhookSendsByInstanceId = new Map<
  string,
  DiscordWebhookInstanceBucket
>();

const tryConsumeDiscordWebhookSlot = (
  instanceId: string,
  now: number,
): boolean => {
  let bucket = discordWebhookSendsByInstanceId.get(instanceId);
  if (
    bucket === undefined ||
    now >= bucket.minuteStartMs + abusePolicy.minuteBucketMs
  ) {
    bucket = { minuteStartMs: now, sendsInMinute: 0 };
    discordWebhookSendsByInstanceId.set(instanceId, bucket);
  }
  if (
    bucket.sendsInMinute >= abusePolicy.discordWebhookLimitPerMinutePerInstance
  ) {
    return false;
  }
  bucket.sendsInMinute += 1;
  return true;
};

export function resetDiscordNotificationThrottleStateForTests(): void {
  lastDiscordSendByWebhookId.clear();
  discordWebhookSendsByInstanceId.clear();
}

export async function sendDiscordNotification(
  webhook: Webhook,
  log: Log,
): Promise<void> {
  try {
    const validation = validateDiscordWebhookUrl(webhook.url);
    if (!validation.valid) {
      console.error(
        `Invalid Discord webhook URL ${webhook.url}: ${validation.error}`,
      );
      return;
    }

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildDiscordNotificationPayload(log)),
      redirect: "error",
    });

    if (!response.ok) {
      console.error(
        `Failed to send Discord notification to webhook ${webhook.id}: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error(
      `Error sending Discord notification to webhook ${webhook.id}:`,
      error,
    );
  }
}

export async function sendDiscordNotificationThrottled(
  webhook: Webhook,
  log: Log,
): Promise<void> {
  const now = Date.now();
  const last = lastDiscordSendByWebhookId.get(webhook.id) ?? 0;
  if (now - last < webhookMinIntervalMs) {
    return;
  }
  if (!tryConsumeDiscordWebhookSlot(log.instanceId, now)) {
    return;
  }
  lastDiscordSendByWebhookId.set(webhook.id, now);
  await sendDiscordNotification(webhook, log);
}
