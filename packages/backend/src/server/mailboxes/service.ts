import {
  MAIL_SIZE_LIMIT_BYTES,
  mailboxAddress,
  type Mailbox,
  type MailboxSummary,
  type MailMessage,
  type MailMessageSummary,
  type SendMailInput,
  type SendRawMailInput,
  type UpdateMailboxInput,
} from "shared";
import { instancePolicies, mailSendingConfig, smtpConfig } from "../../config";
import {
  addMailbox,
  addMailMessage,
  countActiveMailboxesByOwner,
  getMailboxById,
  getMailboxSummariesByOwner,
  getMailMessage,
  hasActiveInstance,
  mailboxIdExists,
  updateMailbox,
  type MailboxRecord,
} from "../../storage";
import { createFixedWindowRateLimiter } from "../rateLimit";
import { generateInstanceID } from "../utils";
import { createKeyedWaiters } from "../waiters";
import { composeMessage } from "./compose";
import { deliverMail } from "./delivery";
import {
  flattenAddresses,
  htmlToText,
  inlineImages,
  listAttachments,
  parseEmail,
  summarizeEmail,
} from "./parse";

export type MailboxServiceError = { message: string; status: number };

export type MailboxServiceResult<T> =
  { ok: true; value: T } | { ok: false; error: MailboxServiceError };

const fail = (
  message: string,
  status: number,
): MailboxServiceResult<never> => ({
  ok: false,
  error: { message, status },
});

const instancesDomain = smtpConfig.instancesDomain;
const maxMailboxesPerOwner = 100;
const defaultLocalPart = "inbox";
const sendsPerHour = 30;

const sendRateLimiter = createFixedWindowRateLimiter({
  maxRequests: sendsPerHour,
  windowMs: 60 * 60 * 1000,
});

const messageWaiters = createKeyedWaiters();

export const waitForMailboxMessage = messageWaiters.wait;

const withAddress = <T extends MailboxRecord>(mailbox: T) => ({
  ...mailbox,
  address: mailboxAddress(mailbox, instancesDomain),
});

const found = (
  mailbox: MailboxRecord | undefined,
): MailboxServiceResult<Mailbox> =>
  mailbox === undefined
    ? fail("Mailbox not found", 404)
    : { ok: true, value: withAddress(mailbox) };

export const listOwnedMailboxes = (ownerId: string): MailboxSummary[] =>
  getMailboxSummariesByOwner(ownerId).map(withAddress);

export const getOwnedMailbox = (
  mailboxId: string,
  ownerId: string,
): MailboxServiceResult<Mailbox> => {
  const mailbox = getMailboxById(mailboxId);
  return found(mailbox?.ownerId === ownerId ? mailbox : undefined);
};

const generateMailboxId = () => {
  for (;;) {
    const id = generateInstanceID();
    if (!mailboxIdExists(id) && !hasActiveInstance(id)) {
      return id;
    }
  }
};

const expiresAfter = (ttlMs: number | undefined, now: number) =>
  ttlMs === undefined
    ? undefined
    : now + Math.min(ttlMs, instancePolicies.maxTtlMs);

export const createMailbox = (input: {
  ownerId: string;
  localPart?: string;
  label?: string;
  ttlMs?: number;
}): MailboxServiceResult<Mailbox> => {
  if (countActiveMailboxesByOwner(input.ownerId) >= maxMailboxesPerOwner) {
    return fail(
      `Mailbox limit reached (${maxMailboxesPerOwner} active). Delete unused mailboxes first.`,
      403,
    );
  }
  const now = Date.now();
  return found(
    addMailbox({
      id: generateMailboxId(),
      ownerId: input.ownerId,
      localPart: input.localPart ?? defaultLocalPart,
      label: input.label === "" ? undefined : input.label,
      createdAt: now,
      expiresAt: expiresAfter(
        input.ttlMs ?? instancePolicies.defaultTtlMs,
        now,
      ),
    }),
  );
};

export const updateOwnedMailbox = (
  mailboxId: string,
  ownerId: string,
  patch: UpdateMailboxInput,
): MailboxServiceResult<Mailbox> => {
  const owned = getOwnedMailbox(mailboxId, ownerId);
  if (!owned.ok) {
    return owned;
  }
  return found(
    updateMailbox(mailboxId, {
      ...(patch.localPart === undefined ? {} : { localPart: patch.localPart }),
      ...(patch.label === undefined
        ? {}
        : { label: patch.label === "" ? undefined : patch.label }),
    }),
  );
};

export const extendOwnedMailbox = (
  mailboxId: string,
  ownerId: string,
  ttlMs = instancePolicies.maxTtlMs,
): MailboxServiceResult<Mailbox> => {
  const owned = getOwnedMailbox(mailboxId, ownerId);
  if (!owned.ok) {
    return owned;
  }
  const { expiresAt } = owned.value;
  if (expiresAt === undefined) {
    return owned;
  }
  return found(
    updateMailbox(mailboxId, {
      expiresAt: Math.max(
        expiresAt,
        expiresAfter(ttlMs, Date.now()) ?? expiresAt,
      ),
    }),
  );
};

const byteLength = (value: string) => Buffer.byteLength(value, "utf8");

export const storeInboundMail = async (input: {
  mailboxId: string;
  raw: string;
  mailFrom: string;
  rcptTo: string[];
  clientAddress: string;
  timestamp: number;
}): Promise<void> => {
  const summary = await parseEmail(input.raw)
    .then(summarizeEmail)
    .catch(() => undefined);
  addMailMessage({
    id: crypto.randomUUID(),
    mailboxId: input.mailboxId,
    direction: "inbound",
    timestamp: input.timestamp,
    isRead: false,
    fromName: summary?.from?.name ?? null,
    fromAddress: summary?.from?.address ?? (input.mailFrom || null),
    toJson: summary?.to ?? input.rcptTo,
    subject: summary?.subject ?? "",
    preview: summary?.preview ?? "",
    attachmentCount: summary?.attachmentCount ?? 0,
    sizeBytes: byteLength(input.raw),
    messageId: summary?.messageId ?? null,
    mailFrom: input.mailFrom,
    rcptToJson: input.rcptTo,
    clientAddress: input.clientAddress,
    raw: input.raw,
  });
  messageWaiters.notify(input.mailboxId);
};

export const readMailMessage = async (
  mailboxId: string,
  messageId: string,
  { withInlineImages = true }: { withInlineImages?: boolean } = {},
): Promise<MailMessage | undefined> => {
  const stored = getMailMessage(mailboxId, messageId);
  if (stored === undefined) {
    return undefined;
  }
  const email = await parseEmail(stored.raw).catch(() => undefined);
  return {
    ...stored.summary,
    cc: flattenAddresses(email?.cc),
    replyTo: flattenAddresses(email?.replyTo),
    date: email?.date,
    text: email === undefined ? stored.raw : email.text,
    html:
      email === undefined || !withInlineImages
        ? email?.html
        : inlineImages(email),
    attachments: email === undefined ? [] : listAttachments(email),
    headers: (email?.headers ?? []).map(({ originalKey, value }) => ({
      key: originalKey,
      value,
    })),
    envelope: stored.envelope,
  };
};

export const readMailAttachment = async (
  mailboxId: string,
  messageId: string,
  index: number,
) => {
  const stored = getMailMessage(mailboxId, messageId);
  if (stored === undefined) {
    return undefined;
  }
  const email = await parseEmail(stored.raw).catch(() => undefined);
  const attachment = email?.attachments[index];
  if (attachment === undefined) {
    return undefined;
  }
  return {
    filename: attachment.filename ?? `attachment-${index + 1}`,
    mimeType: attachment.mimeType,
    content: attachment.content,
  };
};

const replyHeaders = async (
  mailboxId: string,
  inReplyTo: string | undefined,
) => {
  if (inReplyTo === undefined) {
    return {};
  }
  const original = getMailMessage(mailboxId, inReplyTo);
  if (original?.messageId === undefined) {
    return {};
  }
  const email = await parseEmail(original.raw).catch(() => undefined);
  return {
    inReplyTo: original.messageId,
    references: [email?.references, original.messageId]
      .filter((value) => value !== undefined && value !== "")
      .join(" "),
  };
};

type SendResult = MailboxServiceResult<{
  message: MailMessageSummary;
  rejected: { address: string; error: string }[];
}>;

const mailboxHost = (mailbox: Mailbox) => `${mailbox.id}.${instancesDomain}`;

const localSmtpPort = mailSendingConfig.enabled
  ? smtpConfig.smtpPort
  : undefined;

const deliverFromMailbox = async (
  mailbox: Mailbox,
  to: string[],
  raw: string,
): Promise<SendResult> => {
  if (byteLength(raw) > MAIL_SIZE_LIMIT_BYTES) {
    return fail(
      `Message exceeds ${MAIL_SIZE_LIMIT_BYTES / (1024 * 1024)} MB`,
      413,
    );
  }
  if (localSmtpPort === undefined) {
    return fail("Sending mail is disabled on this server", 403);
  }
  if (!sendRateLimiter.check(mailbox.ownerId)) {
    return fail(`Send limit reached (${sendsPerHour} per hour)`, 429);
  }

  const from = mailbox.address;
  const result = await deliverMail(
    {
      instancesDomain,
      localSmtpPort,
      heloName: instancesDomain,
      relay: mailSendingConfig.relay,
    },
    { from, to, data: raw },
  );
  if (result.accepted.length === 0) {
    return fail(
      result.rejected
        .map(({ address, error }) => `${address}: ${error}`)
        .join("; "),
      502,
    );
  }

  const summary = await parseEmail(raw)
    .then(summarizeEmail)
    .catch(() => undefined);
  const id = crypto.randomUUID();
  addMailMessage({
    id,
    mailboxId: mailbox.id,
    direction: "outbound",
    timestamp: Date.now(),
    isRead: true,
    fromName: summary?.from?.name ?? null,
    fromAddress: summary?.from?.address ?? from,
    toJson: to,
    subject: summary?.subject ?? "",
    preview: summary?.preview ?? "",
    attachmentCount: summary?.attachmentCount ?? 0,
    sizeBytes: byteLength(raw),
    messageId: summary?.messageId ?? null,
    mailFrom: from,
    rcptToJson: result.accepted,
    clientAddress: null,
    raw,
  });
  const stored = getMailMessage(mailbox.id, id);
  if (stored === undefined) {
    return fail("Mailbox not found", 404);
  }
  return {
    ok: true,
    value: { message: stored.summary, rejected: result.rejected },
  };
};

export const sendMailFromMailbox = async (
  mailbox: Mailbox,
  input: SendMailInput,
): Promise<SendResult> => {
  const to = [...new Set(input.to)];
  const raw = composeMessage({
    from: mailbox.address,
    to,
    subject: input.subject,
    text:
      input.text === "" && input.html !== undefined
        ? htmlToText(input.html)
        : input.text,
    html: input.html,
    attachments: input.attachments,
    messageId: `<${crypto.randomUUID()}@${mailboxHost(mailbox)}>`,
    date: new Date(),
    ...(await replyHeaders(mailbox.id, input.inReplyTo)),
  });
  return deliverFromMailbox(mailbox, to, raw);
};

export const sendRawMailFromMailbox = async (
  mailbox: Mailbox,
  input: SendRawMailInput,
): Promise<SendResult> => {
  const raw = input.raw.replace(/\r?\n/g, "\r\n");
  const email = await parseEmail(raw).catch(() => undefined);
  const senders = flattenAddresses(email?.from);
  const host = mailboxHost(mailbox);
  if (
    senders.length === 0 ||
    !senders.every(
      ({ address }) =>
        address.slice(address.lastIndexOf("@") + 1).toLowerCase() === host,
    )
  ) {
    return fail(`The From header must be an address at ${host}`, 400);
  }
  return deliverFromMailbox(mailbox, [...new Set(input.to)], raw);
};
