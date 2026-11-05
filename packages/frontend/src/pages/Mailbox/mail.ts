import dayjs from "dayjs";
import type { EmailAddress, MailMessage, MailMessageSummary } from "shared";

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

const remoteContentPattern =
  /\b(?:src|background|poster)\s*=\s*["']?\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\//i;

export const hasRemoteContent = (html: string) =>
  remoteContentPattern.test(html);

export const emailDocument = (
  email: { head: string; body: string },
  allowRemote: boolean,
) => {
  const remote = allowRemote ? " https: http:" : "";
  const policy = [
    "default-src 'none'",
    `img-src data:${remote}`,
    `style-src 'unsafe-inline'${remote}`,
    `font-src data:${remote}`,
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>html{color-scheme:light}body{margin:0;padding:20px;font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#18181b;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>${email.head}</head><body>${email.body}</body></html>`;
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
