import type { McpServer } from "@modelcontextprotocol/server";
import { UpdatePhoneSchema } from "shared";
import * as z from "zod/v4";
import {
  listPhoneSms,
  listUserPhones,
  updatePhoneNotes,
  wakeUserPhone,
  watchPhoneSms,
  type PhoneServiceResult,
  type SmsCursor,
} from "../phones";
import {
  getAuthContext,
  jsonToolResult,
  requireScope,
  toolError,
} from "./context";
import { mcpWatchLimiter, mcpWatchTimeoutMs } from "./watchLimit";

const encodeCursor = (cursor: SmsCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeCursor = (cursor: string | undefined): SmsCursor | undefined => {
  if (cursor === undefined) {
    return undefined;
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<SmsCursor>;
    if (typeof decoded.at === "number" && typeof decoded.id === "string") {
      return { at: decoded.at, id: decoded.id };
    }
  } catch {}
  throw new Error("Invalid cursor");
};

const toolResult = <T>(
  result: PhoneServiceResult<T>,
  wrap: (value: T) => Record<string, unknown>,
) =>
  result.ok
    ? jsonToolResult(wrap(result.value))
    : toolError(result.error.message);

const phoneIdInput = z.string().min(1).max(100);

export const registerPhoneTools = (server: McpServer) => {
  server.registerTool(
    "list_phones",
    {
      title: "List Phones",
      description:
        "List phone numbers from the user's SMS provider, with notes recording which site or account uses each one. Lines with alwaysOn false receive SMS only after wake_phone.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (_input, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "phones:read");
      return toolResult(await listUserPhones(auth.user.id), (phones) => ({
        phones,
      }));
    },
  );

  server.registerTool(
    "list_sms",
    {
      title: "List SMS",
      description:
        "List SMS received by a phone, newest first, with the sender, time and the verification code the provider parsed from it.",
      inputSchema: z.object({
        phoneId: phoneIdInput,
        limit: z.number().int().min(1).max(100).default(20),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ phoneId, limit }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "phones:read");
      return toolResult(
        await listPhoneSms(auth.user.id, phoneId, limit),
        (messages) => ({ messages }),
      );
    },
  );

  server.registerTool(
    "watch_phone",
    {
      title: "Watch Phone",
      description:
        "Wait for new SMS to a phone. Without cursor, waits for SMS arriving after the call. Pass the returned resumeCursor as cursor on the next call.",
      inputSchema: z.object({
        phoneId: phoneIdInput,
        cursor: z.string().max(512).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ phoneId, cursor }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "phones:read");
      const afterCursor = decodeCursor(cursor);
      const release = mcpWatchLimiter.acquire(auth.apiKey.id);
      if (release === undefined) {
        return toolError("Too many concurrent watches");
      }
      try {
        const result = await watchPhoneSms(auth.user.id, phoneId, {
          cursor: afterCursor,
          timeoutMs: mcpWatchTimeoutMs,
          signal: extra.mcpReq.signal,
        });
        if (extra.mcpReq.signal.aborted) {
          return toolError("Watch cancelled");
        }
        return toolResult(result, (value) => ({
          messages: value.messages,
          resumeCursor: encodeCursor(value.cursor),
          pollAfterMs: 1000,
        }));
      } finally {
        release();
      }
    },
  );

  server.registerTool(
    "wake_phone",
    {
      title: "Wake Phone",
      description:
        "Wake a line whose alwaysOn is false. It receives SMS only between usageWindowStart and usageWindowEnd, so trigger the SMS inside that window and wake it again for later codes.",
      inputSchema: z.object({ phoneId: phoneIdInput }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ phoneId }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "phones:write");
      return toolResult(await wakeUserPhone(auth.user.id, phoneId), (wake) => ({
        wake,
      }));
    },
  );

  server.registerTool(
    "update_phone",
    {
      title: "Update Phone",
      description:
        "Set a phone's notes, e.g. the site and account that use the number. An empty string clears them.",
      inputSchema: UpdatePhoneSchema.extend({
        phoneId: phoneIdInput,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ phoneId, notes }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "phones:write");
      return toolResult(
        await updatePhoneNotes(auth.user.id, phoneId, notes),
        (phone) => ({ phone }),
      );
    },
  );
};
