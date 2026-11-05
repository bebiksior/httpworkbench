import { z } from "zod";

export const MAILBOX_LOCAL_PART_PATTERN =
  /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;

export const MAIL_RECIPIENT_PATTERN =
  /^[^\s<>()[\]\\,;:@"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const MAX_MAIL_RECIPIENTS = 10;
export const MAIL_BODY_LIMIT_CHARS = 100_000;

export const MailboxLocalPartSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(64)
  .regex(MAILBOX_LOCAL_PART_PATTERN, "Use letters, digits, and . _ + -");

const MailboxLabelSchema = z.string().trim().max(100);

export const MailboxSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  localPart: z.string(),
  address: z.string(),
  label: z.string().optional(),
  createdAt: z.number(),
  expiresAt: z.number().optional(),
});

export type Mailbox = z.infer<typeof MailboxSchema>;

export const MailboxSummarySchema = MailboxSchema.extend({
  messageCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  lastMessageAt: z.number().optional(),
});

export type MailboxSummary = z.infer<typeof MailboxSummarySchema>;

export const MailboxesResponseSchema = z.array(MailboxSummarySchema);

export const MailDirectionSchema = z.enum(["inbound", "outbound"]);

export type MailDirection = z.infer<typeof MailDirectionSchema>;

export const MailFolderSchema = z.enum(["inbox", "sent"]);

export type MailFolder = z.infer<typeof MailFolderSchema>;

export const folderDirection = (folder: MailFolder): MailDirection =>
  folder === "sent" ? "outbound" : "inbound";

export const EmailAddressSchema = z.object({
  name: z.string(),
  address: z.string(),
});

export type EmailAddress = z.infer<typeof EmailAddressSchema>;

export const MailMessageSummarySchema = z.object({
  id: z.string(),
  mailboxId: z.string(),
  direction: MailDirectionSchema,
  timestamp: z.number(),
  read: z.boolean(),
  from: EmailAddressSchema.optional(),
  to: z.array(z.string()),
  subject: z.string(),
  preview: z.string(),
  attachmentCount: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
});

export type MailMessageSummary = z.infer<typeof MailMessageSummarySchema>;

export const MailAttachmentSchema = z.object({
  index: z.number().int().nonnegative(),
  filename: z.string().optional(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});

export type MailAttachment = z.infer<typeof MailAttachmentSchema>;

export const MailEnvelopeSchema = z.object({
  mailFrom: z.string(),
  rcptTo: z.array(z.string()),
  clientAddress: z.string().optional(),
});

export const MailMessageSchema = MailMessageSummarySchema.extend({
  cc: z.array(EmailAddressSchema),
  replyTo: z.array(EmailAddressSchema),
  date: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  attachments: z.array(MailAttachmentSchema),
  headers: z.array(z.object({ key: z.string(), value: z.string() })),
  envelope: MailEnvelopeSchema,
});

export type MailMessage = z.infer<typeof MailMessageSchema>;

export const MailMessagesPageSchema = z.object({
  messages: z.array(MailMessageSummarySchema),
  nextCursor: z.string().optional(),
});

export type MailMessagesPage = z.infer<typeof MailMessagesPageSchema>;

export const CreateMailboxSchema = z
  .object({
    localPart: MailboxLocalPartSchema.optional(),
    label: MailboxLabelSchema.optional(),
  })
  .strict();

export type CreateMailboxInput = z.infer<typeof CreateMailboxSchema>;

export const UpdateMailboxSchema = z
  .object({
    localPart: MailboxLocalPartSchema.optional(),
    label: MailboxLabelSchema.optional(),
  })
  .strict();

export type UpdateMailboxInput = z.infer<typeof UpdateMailboxSchema>;

export const MailRecipientSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(MAIL_RECIPIENT_PATTERN, "Invalid email address");

const MailBodySchema = z.string().max(MAIL_BODY_LIMIT_CHARS);

export const SendMailSchema = z
  .object({
    to: z.array(MailRecipientSchema).min(1).max(MAX_MAIL_RECIPIENTS),
    subject: z.string().max(998),
    text: MailBodySchema,
    html: MailBodySchema.optional(),
    inReplyTo: z.string().min(1).max(100).optional(),
  })
  .strict();

export type SendMailInput = z.infer<typeof SendMailSchema>;

export const MailRejectionSchema = z.object({
  address: z.string(),
  error: z.string(),
});

export const SendMailResponseSchema = z.object({
  message: MailMessageSummarySchema,
  rejected: z.array(MailRejectionSchema),
});

export type SendMailResponse = z.infer<typeof SendMailResponseSchema>;

export const SetMailMessageReadSchema = z
  .object({ read: z.boolean() })
  .strict();

export const mailboxAddress = (
  mailbox: Pick<Mailbox, "id" | "localPart">,
  instancesDomain: string,
) => `${mailbox.localPart}@${mailbox.id}.${instancesDomain}`;
