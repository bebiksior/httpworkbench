import type { Log } from "shared";

const DISCORD_HTTP_COLOR = 0x3b82f6;
const DISCORD_DNS_COLOR = 0x10b981;
const MAX_RAW_CONTENT_LENGTH = 1024 - 8;
const MAX_ADDRESS_LENGTH = 1024;
const MAX_FOOTER_LENGTH = 2048;

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

export const truncateDiscordField = (
  value: string,
  maxLength: number,
): string => {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.substring(0, maxLength);
  }

  return `${value.substring(0, maxLength - 3)}...`;
};

export const buildDiscordNotificationPayload = (log: Log) => {
  const color = log.type === "http" ? DISCORD_HTTP_COLOR : DISCORD_DNS_COLOR;
  const timestamp = new Date(log.timestamp).toISOString();
  const footerText = truncateDiscordField(
    `Instance: ${log.instanceId}`,
    MAX_FOOTER_LENGTH,
  );
  const truncatedRaw = truncateDiscordField(log.raw, MAX_RAW_CONTENT_LENGTH);
  const truncatedAddress = truncateDiscordField(
    log.address,
    MAX_ADDRESS_LENGTH,
  );

  return {
    embeds: [
      {
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
          text: footerText,
        },
      },
    ],
  };
};
