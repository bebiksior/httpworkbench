import { Elysia, status } from "elysia";
import { z } from "zod";
import {
  CreateMailboxSchema,
  ExtendMailboxSchema,
  MailFolderSchema,
  SendMailSchema,
  SendRawMailSchema,
  SetMailboxLockedSchema,
  SetMailboxPublicSchema,
  SetMailMessageReadSchema,
  UpdateMailboxSchema,
  folderDirection,
} from "shared";
import { instancePolicies, smtpConfig } from "../../config";
import {
  clearMailMessages,
  deleteMailMessage,
  getMailMessage,
  listMailMessages,
  setMailMessageRead,
} from "../../storage";
import {
  apiKeyMissingScope,
  authPlugin,
  enforceApiKeyRateLimit,
  insufficientScopeResponse,
  readSessionCookie,
  resolveOptionalAccess,
} from "../auth";
import {
  createMailbox,
  deleteOwnedMailbox,
  extendOwnedMailbox,
  getOwnedMailbox,
  getReadableMailbox,
  listOwnedMailboxes,
  readMailAttachment,
  readMailMessage,
  sendMailFromMailbox,
  sendRawMailFromMailbox,
  setOwnedMailboxLocked,
  setOwnedMailboxPublic,
  updateOwnedMailbox,
  type MailboxServiceError,
  type MailboxServiceResult,
} from "../mailboxes";
import { decodeLogsCursor, encodeLogsCursor } from "../utils";

const MessagesQuerySchema = z.object({
  folder: MailFolderSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(256).optional(),
});

const ClearMessagesQuerySchema = z.object({
  folder: MailFolderSchema.optional(),
});

const AttachmentParamsSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  index: z.coerce.number().int().min(0),
});

const errorResponse = (error: MailboxServiceError) =>
  status(error.status, { error: error.message });

const respond = <T>(result: MailboxServiceResult<T>, created = false) => {
  if (!result.ok) {
    return errorResponse(result.error);
  }
  return created ? status(201, result.value) : result.value;
};

type CookieJar = Parameters<typeof readSessionCookie>[0];

const loadReadableMailbox = async (
  id: string,
  request: Request,
  cookie: CookieJar,
) => {
  const access = await resolveOptionalAccess(
    request,
    readSessionCookie(cookie),
  );
  const result = getReadableMailbox(id, access?.user.id);
  if (!result.ok) {
    return { ok: false as const, res: errorResponse(result.error) };
  }
  if (!enforceApiKeyRateLimit(access)) {
    return {
      ok: false as const,
      res: status(429, { error: "Rate limit exceeded" }),
    };
  }
  if (!result.value.public && apiKeyMissingScope(access, "mailboxes:read")) {
    return {
      ok: false as const,
      res: insufficientScopeResponse("mailboxes:read"),
    };
  }
  return { ok: true as const, mailbox: result.value };
};

const publicReadNote =
  "Public mailboxes can be read by anyone with the ID, without authentication.";

const messageNotFound = () => status(404, { error: "Message not found" });

const untrustedContentHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox",
};

const routes = new Elysia({ name: "routes/mailboxes" })
  .use(authPlugin)
  .get("/api/mailboxes", ({ user }) => listOwnedMailboxes(user.id), {
    scope: "mailboxes:read",
    detail: {
      tags: ["Mailboxes"],
      summary: "List mailboxes",
      description: "List the key user's mailboxes, newest first.",
    },
  })
  .post(
    "/api/mailboxes",
    ({ body, user }) =>
      respond(
        createMailbox({
          ownerId: user.id,
          localPart: body.localPart,
          label: body.label,
        }),
        true,
      ),
    {
      scope: "mailboxes:write",
      body: CreateMailboxSchema,
      detail: {
        tags: ["Mailboxes"],
        summary: "Create a mailbox",
        description:
          "Create a temporary mailbox. Mail to any address at its host is delivered to it.",
      },
    },
  )
  .get(
    "/api/mailboxes/:id",
    async ({ params, request, cookie }) => {
      const loaded = await loadReadableMailbox(params.id, request, cookie);
      return loaded.ok ? loaded.mailbox : loaded.res;
    },
    {
      detail: {
        tags: ["Mailboxes"],
        summary: "Get a mailbox",
        description: publicReadNote,
      },
    },
  )
  .patch(
    "/api/mailboxes/:id",
    ({ params, body, user }) =>
      respond(updateOwnedMailbox(params.id, user.id, body)),
    {
      scope: "mailboxes:write",
      body: UpdateMailboxSchema,
      detail: {
        tags: ["Mailboxes"],
        summary: "Update a mailbox",
        description:
          "Change the sending address or label. An empty label clears it.",
      },
    },
  )
  .delete(
    "/api/mailboxes/:id",
    ({ params, user }) => {
      const deleted = deleteOwnedMailbox(params.id, user.id);
      return deleted.ok ? { message: "Deleted" } : errorResponse(deleted.error);
    },
    {
      scope: "mailboxes:write",
      detail: {
        tags: ["Mailboxes"],
        summary: "Delete a mailbox",
        description:
          "Delete an unlocked mailbox and all of its messages. Locked mailboxes return 409.",
      },
    },
  )
  .post(
    "/api/mailboxes/:id/extend",
    ({ params, body, user }) =>
      respond(
        extendOwnedMailbox(params.id, user.id, { forever: body?.forever }),
      ),
    {
      scope: "mailboxes:write",
      body: ExtendMailboxSchema.optional(),
      detail: {
        tags: ["Mailboxes"],
        summary: "Extend mailbox expiration",
        description: instancePolicies.isHosted
          ? "Extend an expiring mailbox to the maximum lifetime from now."
          : "Extend an expiring mailbox to the maximum lifetime from now, or remove its expiration with forever=true.",
      },
    },
  )
  .post(
    "/api/mailboxes/:id/lock",
    ({ params, body, user }) =>
      respond(setOwnedMailboxLocked(params.id, user.id, body.locked)),
    {
      scope: "mailboxes:write",
      body: SetMailboxLockedSchema,
      detail: {
        tags: ["Mailboxes"],
        summary: "Lock or unlock a mailbox",
        description:
          "Locked mailboxes cannot be deleted. Locking an expiring mailbox extends it to the maximum lifetime. It does not block other changes.",
      },
    },
  )
  .post(
    "/api/mailboxes/:id/public",
    ({ params, body, user }) =>
      respond(setOwnedMailboxPublic(params.id, user.id, body.public)),
    {
      scope: "mailboxes:write",
      body: SetMailboxPublicSchema,
      detail: {
        tags: ["Mailboxes"],
        summary: "Set mailbox visibility",
        description:
          "Anyone with the ID can read a public mailbox and its messages, read-only. Only the owner can change, send from or delete it.",
      },
    },
  )
  .get(
    "/api/mailboxes/:id/messages",
    async ({ params, query, request, cookie }) => {
      const loaded = await loadReadableMailbox(params.id, request, cookie);
      if (!loaded.ok) {
        return loaded.res;
      }
      const cursor =
        query.cursor === undefined ? undefined : decodeLogsCursor(query.cursor);
      if (query.cursor !== undefined && cursor === undefined) {
        return status(400, { error: "Invalid cursor" });
      }
      const page = listMailMessages({
        mailboxId: params.id,
        direction: folderDirection(query.folder ?? "inbox"),
        limit: query.limit ?? 50,
        beforeSeq: cursor?.seq,
      });
      return {
        messages: page.messages,
        nextCursor:
          page.nextSeq === undefined
            ? undefined
            : encodeLogsCursor({ seq: page.nextSeq }),
      };
    },
    {
      query: MessagesQuerySchema,
      detail: {
        tags: ["Mailboxes"],
        summary: "List messages",
        description: `List inbox or sent messages, newest first. Page with nextCursor. ${publicReadNote}`,
      },
    },
  )
  .delete(
    "/api/mailboxes/:id/messages",
    ({ params, query, user }) => {
      const owned = getOwnedMailbox(params.id, user.id);
      if (!owned.ok) {
        return errorResponse(owned.error);
      }
      clearMailMessages(
        params.id,
        query.folder === undefined ? undefined : folderDirection(query.folder),
      );
      return { message: "Messages cleared" };
    },
    {
      scope: "mailboxes:write",
      query: ClearMessagesQuerySchema,
      detail: {
        tags: ["Mailboxes"],
        summary: "Clear messages",
        description:
          "Delete every message in a folder, or in the whole mailbox.",
      },
    },
  )
  .post(
    "/api/mailboxes/:id/send",
    async ({ params, body, user }) => {
      const owned = getOwnedMailbox(params.id, user.id);
      if (!owned.ok) {
        return errorResponse(owned.error);
      }
      return respond(await sendMailFromMailbox(owned.value, body), true);
    },
    {
      scope: "mailboxes:send",
      body: SendMailSchema,
      detail: {
        tags: ["Mailboxes"],
        summary: "Send an email",
        description:
          "Send a message from the mailbox address. inReplyTo is the id of a message in this mailbox to reply to. Attachments are base64-encoded.",
      },
    },
  )
  .post(
    "/api/mailboxes/:id/send-raw",
    async ({ params, body, user }) => {
      const owned = getOwnedMailbox(params.id, user.id);
      if (!owned.ok) {
        return errorResponse(owned.error);
      }
      return respond(await sendRawMailFromMailbox(owned.value, body), true);
    },
    {
      scope: "mailboxes:send",
      body: SendRawMailSchema,
      detail: {
        tags: ["Mailboxes"],
        summary: "Send a raw MIME message",
        description:
          "Send a complete RFC 5322 message unchanged, for testing MIME and attachment parsing. The From header must be an address at the mailbox host. Line endings are normalized to CRLF.",
      },
    },
  )
  .get(
    "/api/mailboxes/:id/messages/:messageId",
    async ({ params, request, cookie }) => {
      const loaded = await loadReadableMailbox(params.id, request, cookie);
      if (!loaded.ok) {
        return loaded.res;
      }
      return (
        (await readMailMessage(params.id, params.messageId)) ??
        messageNotFound()
      );
    },
    {
      detail: {
        tags: ["Mailboxes"],
        summary: "Read a message",
        description: `Read a parsed message with its text, HTML, headers and attachment list. ${publicReadNote}`,
      },
    },
  )
  .patch(
    "/api/mailboxes/:id/messages/:messageId",
    ({ params, body, user }) => {
      const owned = getOwnedMailbox(params.id, user.id);
      if (!owned.ok) {
        return errorResponse(owned.error);
      }
      if (getMailMessage(params.id, params.messageId) === undefined) {
        return messageNotFound();
      }
      setMailMessageRead(params.id, params.messageId, body.read);
      return { read: body.read };
    },
    {
      scope: "mailboxes:write",
      body: SetMailMessageReadSchema,
      detail: { tags: ["Mailboxes"], summary: "Mark a message read or unread" },
    },
  )
  .delete(
    "/api/mailboxes/:id/messages/:messageId",
    ({ params, user }) => {
      const owned = getOwnedMailbox(params.id, user.id);
      if (!owned.ok) {
        return errorResponse(owned.error);
      }
      return deleteMailMessage(params.id, params.messageId)
        ? { message: "Deleted" }
        : messageNotFound();
    },
    {
      scope: "mailboxes:write",
      detail: { tags: ["Mailboxes"], summary: "Delete a message" },
    },
  )
  .get(
    "/api/mailboxes/:id/messages/:messageId/raw",
    async ({ params, request, cookie }) => {
      const loaded = await loadReadableMailbox(params.id, request, cookie);
      if (!loaded.ok) {
        return loaded.res;
      }
      const stored = getMailMessage(params.id, params.messageId);
      if (stored === undefined) {
        return messageNotFound();
      }
      return new Response(stored.raw, {
        headers: {
          ...untrustedContentHeaders,
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    },
    {
      detail: {
        tags: ["Mailboxes"],
        summary: "Read message source",
        description: `The message exactly as received or sent. ${publicReadNote}`,
      },
    },
  )
  .get(
    "/api/mailboxes/:id/messages/:messageId/attachments/:index",
    async ({ params, request, cookie }) => {
      const loaded = await loadReadableMailbox(params.id, request, cookie);
      if (!loaded.ok) {
        return loaded.res;
      }
      const attachment = await readMailAttachment(
        params.id,
        params.messageId,
        params.index,
      );
      if (attachment === undefined) {
        return status(404, { error: "Attachment not found" });
      }
      const filename = attachment.filename.replace(/[^\w.-]+/g, "_");
      return new Response(attachment.content, {
        headers: {
          ...untrustedContentHeaders,
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
    {
      params: AttachmentParamsSchema,
      detail: {
        tags: ["Mailboxes"],
        summary: "Download an attachment",
        description: publicReadNote,
      },
    },
  );

export const mailboxesRoutes = smtpConfig.smtpEnabled
  ? routes
  : new Elysia({ name: "routes/mailboxes" });
