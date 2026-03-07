import type { Log, Webhook } from "shared";
import {
  buildDiscordNotificationPayload,
  validateDiscordWebhookUrl,
} from "./discord";

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
