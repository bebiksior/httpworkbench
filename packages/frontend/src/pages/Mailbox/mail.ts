import dayjs from "dayjs";
import {
  MAIL_SIZE_LIMIT_BYTES,
  MAX_MAIL_ATTACHMENTS,
  type EmailAddress,
  type MailMessage,
  type MailMessageSummary,
} from "shared";

export type ComposeDraft = {
  to: string;
  subject: string;
  body: string;
  html: boolean;
  inReplyTo?: string;
};

export const emptyDraft = (): ComposeDraft => ({
  to: "",
  subject: "",
  body: "",
  html: false,
  inReplyTo: undefined,
});

export const addressLabel = (address: EmailAddress | undefined) =>
  address === undefined
    ? "Unknown sender"
    : address.name.trim() || address.address;

export const correspondentLabel = (message: MailMessageSummary) =>
  message.direction === "outbound"
    ? message.to.join(", ") || "No recipients"
    : addressLabel(message.from);

export const formatMailTime = (timestamp: number, now = Date.now()) => {
  const date = dayjs(timestamp);
  const current = dayjs(now);
  if (date.isSame(current, "day")) {
    return date.format("HH:mm");
  }
  if (date.isSame(current, "year")) {
    return date.format("MMM D");
  }
  return date.format("MMM D, YYYY");
};

export const formatExpiry = (
  expiresAt: number | undefined,
  now = Date.now(),
) => {
  if (expiresAt === undefined) {
    return undefined;
  }
  const hours = Math.max(0, Math.round((expiresAt - now) / 3_600_000));
  if (hours < 1) {
    return "Expires soon";
  }
  return hours < 48
    ? `Expires in ${hours}h`
    : `Expires in ${Math.round(hours / 24)}d`;
};

export const formatSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const MAX_ATTACHMENT_BYTES =
  Math.floor((MAIL_SIZE_LIMIT_BYTES * 3) / 4) - 64 * 1024;

export const addAttachments = <T extends { size: number }>(
  current: T[],
  added: T[],
) => {
  const files = [...current];
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of added) {
    if (
      files.length >= MAX_MAIL_ATTACHMENTS ||
      total + file.size > MAX_ATTACHMENT_BYTES
    ) {
      break;
    }
    files.push(file);
    total += file.size;
  }
  return { files, skipped: current.length + added.length - files.length };
};

export const parseRecipients = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

export const replyDraft = (message: MailMessage): ComposeDraft => {
  const recipient = message.replyTo[0]?.address ?? message.from?.address ?? "";
  const subject = /^re:/i.test(message.subject)
    ? message.subject
    : `Re: ${message.subject}`;
  const quoted = (message.text ?? message.preview)
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  const when = dayjs(message.timestamp).format("MMM D, YYYY HH:mm");
  return {
    to: recipient,
    subject,
    body: `\n\nOn ${when}, ${addressLabel(message.from)} wrote:\n${quoted}`,
    html: false,
    inReplyTo: message.id,
  };
};

export type TextSegment = { text: string; href?: string };

export const linkifyText = (text: string): TextSegment[] => {
  const segments: TextSegment[] = [];
  let offset = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const href = match[0].replace(/[.,;:!?)\]]+$/, "");
    const start = match.index;
    if (start > offset) {
      segments.push({ text: text.slice(offset, start) });
    }
    segments.push({ text: href, href });
    offset = start + href.length;
  }
  if (offset < text.length) {
    segments.push({ text: text.slice(offset) });
  }
  return segments;
};
