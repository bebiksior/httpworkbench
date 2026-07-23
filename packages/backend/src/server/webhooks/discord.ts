import type { Log } from "shared";
import { trySafeExternalUrl } from "urlguard";

const DISCORD_HTTP_COLOR = 0x3b82f6;
const DISCORD_DNS_COLOR = 0x10b981;
const DISCORD_SMTP_COLOR = 0x8b5cf6;
const DISCORD_LOG_COLORS: Record<Log["type"], number> = {
  http: DISCORD_HTTP_COLOR,
  dns: DISCORD_DNS_COLOR,
  smtp: DISCORD_SMTP_COLOR,
};
const MAX_MESSAGE_CONTENT_LENGTH = 2000;
const MAX_RAW_CONTENT_LENGTH = 1024 - 8;
const MAX_ADDRESS_LENGTH = 1024;
const MAX_FOOTER_LENGTH = 2048;
const DISCORD_MESSAGE_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const DISCORD_MENTION_BREAK = "\u200B";
const DISCORD_WEBHOOK_URL_POLICY = {
  allowedHosts: ["discord.com", "discordapp.com"],
  allowedPorts: [443],
  allowedProtocols: ["https"],
} as const;

export type DiscordLogBatchSummary = {
  total: number;
  counts: Record<Log["type"], number>;
};

export function validateDiscordWebhookUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  const policyCheck = trySafeExternalUrl(parsed, DISCORD_WEBHOOK_URL_POLICY);
  if (policyCheck.kind !== "Ok") {
    return { valid: false, error: "URL must be a Discord webhook URL" };
  }

  if (!parsed.pathname.startsWith("/api/webhooks/")) {
    return { valid: false, error: "Invalid Discord webhook URL format" };
  }

  return { valid: true };
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

const sanitizeDiscordPlaceholderValue = (value: string): string => {
  return value
    .replaceAll("@everyone", `@${DISCORD_MENTION_BREAK}everyone`)
    .replaceAll("@here", `@${DISCORD_MENTION_BREAK}here`)
    .replaceAll(/<@([!&]?)(\d+)>/g, `<@$1${DISCORD_MENTION_BREAK}$2>`)
    .replaceAll(/<#(\d+)>/g, `<#${DISCORD_MENTION_BREAK}$1>`);
};

const renderDiscordMessageTemplate = (template: string, log: Log): string => {
  const values = {
    address: sanitizeDiscordPlaceholderValue(log.address),
    instanceId: sanitizeDiscordPlaceholderValue(log.instanceId),
    text: sanitizeDiscordPlaceholderValue(log.raw),
    timestamp: sanitizeDiscordPlaceholderValue(
      new Date(log.timestamp).toISOString(),
    ),
    type: sanitizeDiscordPlaceholderValue(log.type.toUpperCase()),
  } as const;

  return template.replace(DISCORD_MESSAGE_PLACEHOLDER_PATTERN, (match, key) => {
    const placeholderKey = key as keyof typeof values;
    return values[placeholderKey] ?? match;
  });
};

export const buildDiscordNotificationPayload = (
  log: Log,
  messageTemplate?: string,
  batch?: DiscordLogBatchSummary,
) => {
  const color = DISCORD_LOG_COLORS[log.type];
  const timestamp = new Date(log.timestamp).toISOString();
  const footerText = truncateDiscordField(
    `Instance: ${log.instanceId}`,
    MAX_FOOTER_LENGTH,
  );
  const truncatedRaw = truncateDiscordField(log.raw, MAX_RAW_CONTENT_LENGTH);
  const addressValue =
    log.addressVerified === false ? `${log.address} (unverified)` : log.address;
  const truncatedAddress = truncateDiscordField(
    addressValue,
    MAX_ADDRESS_LENGTH,
  );
  const content =
    messageTemplate === undefined
      ? undefined
      : truncateDiscordField(
          renderDiscordMessageTemplate(messageTemplate, log),
          MAX_MESSAGE_CONTENT_LENGTH,
        );
  const batchFields =
    batch === undefined || batch.total <= 1
      ? []
      : [
          {
            name: "Debounced batch",
            value: (["http", "dns", "smtp"] as const)
              .flatMap((type) => {
                const count = batch.counts[type];
                return count === 0 ? [] : [`${type.toUpperCase()}: ${count}`];
              })
              .join("\n"),
            inline: false,
          },
        ];

  return {
    content,
    embeds: [
      {
        title:
          batch === undefined || batch.total <= 1
            ? `${log.type.toUpperCase()} Log Received`
            : `${log.type.toUpperCase()} Log Received (${batch.total} total)`,
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
          ...batchFields,
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
