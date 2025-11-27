import type { Log, Webhook } from "shared";

export function validateDiscordWebhookUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  try {
    const parsed = new URL(url);

    if (
      parsed.hostname !== "discord.com" &&
      parsed.hostname !== "discordapp.com"
    ) {
      return { valid: false, error: "URL must be a Discord webhook URL" };
    }

    if (!parsed.pathname.startsWith("/api/webhooks/")) {
      return { valid: false, error: "Invalid Discord webhook URL format" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
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

    const color = log.type === "http" ? 0x3b82f6 : 0x10b981;

    const timestamp = new Date(log.timestamp).toISOString();

    const maxRawContentLength = 1024 - 8;
    const truncatedRaw =
      log.raw.length > maxRawContentLength
        ? `${log.raw.substring(0, maxRawContentLength - 3)}...`
        : log.raw;

    const maxAddressLength = 1024;
    const truncatedAddress =
      log.address.length > maxAddressLength
        ? `${log.address.substring(0, maxAddressLength - 3)}...`
        : log.address;

    const maxFooterLength = 2048;
    const footerText = `Instance: ${log.instanceId}`;
    const truncatedFooter =
      footerText.length > maxFooterLength
        ? footerText.substring(0, maxFooterLength)
        : footerText;

    const embed = {
      title: `${log.type.toUpperCase()} Log Received`,
      color,
      fields: [
        {
          name: "Type",
          value: log.type.toUpperCase(),
          inline: true,
        },
        {
          name: "Address",
          value: truncatedAddress,
          inline: true,
        },
        {
          name: "Timestamp",
          value: timestamp,
          inline: false,
        },
        {
          name: "Raw Content",
          value: `\`\`\`\n${truncatedRaw}\n\`\`\``,
          inline: false,
        },
      ],
      footer: {
        text: truncatedFooter,
      },
    };

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [embed],
      }),
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
