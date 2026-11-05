import type { McpServer } from "@modelcontextprotocol/server";
import {
  folderDirection,
  MailboxLocalPartSchema,
  MailFolderSchema,
  SendMailSchema,
  type MailboxSummary,
} from "shared";
import * as z from "zod/v4";
import { instancePolicies, mailSendingConfig, smtpConfig } from "../../config";
import {
  deleteMailbox,
  deleteMailMessage,
  latestMailMessageSeq,
  listMailMessages,
  listMailMessagesAfter,
  setMailMessageRead,
} from "../../storage";
import type { ApiKeyAuthContext } from "../apiKeyAuth";
import {
  createMailbox,
  extendOwnedMailbox,
  getOwnedMailbox,
  listOwnedMailboxes,
  readMailMessage,
  sendMailFromMailbox,
  updateOwnedMailbox,
  waitForMailboxMessage,
  type MailboxServiceResult,
} from "../mailboxes";
import { extractLinks } from "../mailboxes/parse";
import { decodeLogsCursor, encodeLogsCursor } from "../utils";
import {
  getAuthContext,
  jsonToolResult,
  requireScope,
  toolError,
} from "./context";
import { mcpWatchLimiter, mcpWatchTimeoutMs } from "./watchLimit";

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const maxTtlDays = Math.floor(instancePolicies.maxTtlMs / dayMs);

const requireOwnedMailbox = (mailboxId: string, auth: ApiKeyAuthContext) => {
  const result = getOwnedMailbox(mailboxId, auth.user.id);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

const serializeMailbox = (
  mailbox: Pick<
    MailboxSummary,
    "id" | "address" | "label" | "createdAt" | "expiresAt"
  >,
) => ({
  id: mailbox.id,
  address: mailbox.address,
  label: mailbox.label,
  createdAt: mailbox.createdAt,
  expiresAt: mailbox.expiresAt,
});

const mailboxResult = <T extends Parameters<typeof serializeMailbox>[0]>(
  result: MailboxServiceResult<T>,
) =>
  result.ok
    ? jsonToolResult({ mailbox: serializeMailbox(result.value) })
    : toolError(result.error.message);

const decodeCursor = (cursor: string | undefined) => {
  if (cursor === undefined) {
    return undefined;
  }
  const decoded = decodeLogsCursor(cursor);
  if (decoded === undefined) {
    throw new Error("Invalid cursor");
  }
  return decoded.seq;
};

const mailboxIdInput = z.string().min(1);

export const registerMailboxTools = (server: McpServer) => {
  if (!smtpConfig.smtpEnabled) {
    return;
  }

  server.registerTool(
    "list_mailboxes",
    {
      title: "List Mailboxes",
      description:
        "List owned temporary mailboxes, newest first, with unread inbox counts.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_input, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "mailboxes:read");
      return jsonToolResult({
        mailboxes: listOwnedMailboxes(auth.user.id).map((mailbox) => ({
          ...serializeMailbox(mailbox),
          messageCount: mailbox.messageCount,
          unreadCount: mailbox.unreadCount,
          lastMessageAt: mailbox.lastMessageAt,
        })),
      });
    },
  );

  server.registerTool(
    "create_mailbox",
    {
      title: "Create Mailbox",
      description: `Create a temporary mailbox at <id>.${smtpConfig.instancesDomain}. Mail to any address at that host, or any subdomain of it, lands in the inbox, so one mailbox can tell several signups apart by local part.`,
      inputSchema: z.object({
        localPart: MailboxLocalPartSchema.optional().describe(
          "Local part of the address used to send mail. Defaults to inbox.",
        ),
        label: z
          .string()
          .max(100)
          .optional()
          .describe("Short name for the target and purpose."),
        ttlHours: z
          .number()
          .int()
          .min(1)
          .max(72)
          .default(72)
          .describe("Lifetime in hours from creation. Defaults to 72."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ localPart, label, ttlHours }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "mailboxes:write");
      return mailboxResult(
        createMailbox({
          ownerId: auth.user.id,
          localPart,
          label,
          ttlMs: ttlHours * hourMs,
        }),
      );
    },
  );

  server.registerTool(
    "update_mailbox",
    {
      title: "Update Mailbox",
      description:
        "Change an owned mailbox's sending local part or label. An empty label clears it.",
      inputSchema: z.object({
        mailboxId: mailboxIdInput,
        localPart: MailboxLocalPartSchema.optional(),
        label: z.string().max(100).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ mailboxId, localPart, label }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "mailboxes:write");
      return mailboxResult(
        updateOwnedMailbox(mailboxId, auth.user.id, { localPart, label }),
      );
    },
  );

  server.registerTool(
    "extend_mailbox",
    {
      title: "Extend Mailbox",
      description:
        "Move an owned mailbox's expiry to ttlDays from now. Never shortens it.",
      inputSchema: z.object({
        mailboxId: mailboxIdInput,
        ttlDays: z.number().int().min(1).max(maxTtlDays),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ mailboxId, ttlDays }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "mailboxes:write");
      return mailboxResult(
        extendOwnedMailbox(mailboxId, auth.user.id, ttlDays * dayMs),
      );
    },
  );

  server.registerTool(
    "delete_mailbox",
    {
      title: "Delete Mailbox",
      description: "Delete an owned mailbox and all of its messages.",
      inputSchema: z.object({ mailboxId: mailboxIdInput }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ mailboxId }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "mailboxes:write");
      requireOwnedMailbox(mailboxId, auth);
      deleteMailbox(mailboxId);
      return jsonToolResult({ deleted: true });
    },
  );

  server.registerTool(
    "list_messages",
    {
      title: "List Messages",
      description:
        "List messages in a mailbox folder, newest first, without bodies. Page older messages with nextCursor.",
      inputSchema: z.object({
        mailboxId: mailboxIdInput,
        folder: MailFolderSchema.default("inbox"),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().max(256).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ mailboxId, folder, limit, cursor }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "mailboxes:read");
      requireOwnedMailbox(mailboxId, auth);
      const page = listMailMessages({
        mailboxId,
        direction: folderDirection(folder),
        limit,
        beforeSeq: decodeCursor(cursor),
      });
      return jsonToolResult({
        messages: page.messages,
        nextCursor:
          page.nextSeq === undefined
            ? undefined
            : encodeLogsCursor({ seq: page.nextSeq }),
      });
    },
  );

  server.registerTool(
    "read_message",
    {
      title: "Read Message",
      description:
        "Read one message: sender, recipients, subject, text body and the links it contains. Marks it read.",
      inputSchema: z.object({
        mailboxId: mailboxIdInput,
        messageId: z.string().min(1),
        includeHtml: z
          .boolean()
          .default(false)
          .describe(
            "Include the HTML body. It is always included when there is no text body.",
          ),
        includeHeaders: z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ mailboxId, messageId, includeHtml, includeHeaders }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "mailboxes:read");
      requireOwnedMailbox(mailboxId, auth);
      const message = await readMailMessage(mailboxId, messageId, {
        withInlineImages: includeHtml,
      });
      if (message === undefined) {
        return toolError("Message not found");
      }
      if (!message.read) {
        setMailMessageRead(mailboxId, messageId, true);
      }
      const { headers, html, preview: _preview, ...rest } = message;
      return jsonToolResult({
        message: {
          ...rest,
          read: true,
          html: includeHtml || message.text === undefined ? html : undefined,
          headers: includeHeaders ? headers : undefined,
          links: extractLinks(message),
        },
      });
    },
  );

  server.registerTool(
    "watch_mailbox",
    {
      title: "Watch Mailbox",
      description:
        "Wait for new inbox messages. Without cursor, waits for mail arriving after the call. Pass the returned resumeCursor as cursor on the next call.",
      inputSchema: z.object({
        mailboxId: mailboxIdInput,
        cursor: z.string().max(256).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ mailboxId, cursor }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "mailboxes:read");
      requireOwnedMailbox(mailboxId, auth);
      const afterSeq = decodeCursor(cursor) ?? latestMailMessageSeq(mailboxId);
      const release = mcpWatchLimiter.acquire(auth.apiKey.id);
      if (release === undefined) {
        return toolError("Too many concurrent watches");
      }

      const waiter = waitForMailboxMessage(
        mailboxId,
        mcpWatchTimeoutMs,
        extra.mcpReq.signal,
      );
      try {
        const readNew = () =>
          listMailMessagesAfter({
            mailboxId,
            direction: "inbound",
            afterSeq,
            limit: 20,
          });
        let page = readNew();
        if (page.messages.length === 0) {
          await waiter.promise;
          if (extra.mcpReq.signal.aborted) {
            return toolError("Watch cancelled");
          }
          page = readNew();
        }
        return jsonToolResult({
          messages: page.messages,
          resumeCursor: encodeLogsCursor({ seq: page.lastSeq }),
          pollAfterMs: 1000,
        });
      } finally {
        waiter.cancel();
        release();
      }
    },
  );

  server.registerTool(
    "delete_message",
    {
      title: "Delete Message",
      description: "Delete one message from an owned mailbox.",
      inputSchema: z.object({
        mailboxId: mailboxIdInput,
        messageId: z.string().min(1),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ mailboxId, messageId }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "mailboxes:write");
      requireOwnedMailbox(mailboxId, auth);
      return deleteMailMessage(mailboxId, messageId)
        ? jsonToolResult({ deleted: true })
        : toolError("Message not found");
    },
  );

  if (!mailSendingConfig.enabled) {
    return;
  }

  server.registerTool(
    "send_email",
    {
      title: "Send Email",
      description:
        "Send a plain text email, with an optional HTML alternative, from a mailbox's address. Set inReplyTo to a message id from the mailbox to reply in its thread.",
      inputSchema: z.object({
        mailboxId: mailboxIdInput,
        ...SendMailSchema.shape,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ mailboxId, ...input }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "mailboxes:send");
      const mailbox = requireOwnedMailbox(mailboxId, auth);
      const result = await sendMailFromMailbox(mailbox, input);
      return result.ok
        ? jsonToolResult({
            messageId: result.value.message.id,
            rejected: result.value.rejected,
          })
        : toolError(result.error.message);
    },
  );
};
