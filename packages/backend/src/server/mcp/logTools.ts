import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { clearLogsForInstance, getLogsForInstancePage } from "../../storage";
import type { ApiKeyAuthContext } from "../apiKeyAuth";
import { waitForInstanceLog } from "../instances/logStream";
import {
  clampLogLimit,
  decodeLogsCursor,
  encodeLogsCursor,
  MAX_LOG_LIMIT,
} from "../utils";
import {
  getAuthContext,
  jsonToolResult,
  requireOwnedInstance,
  requireScope,
  toolError,
} from "./context";
import { createConcurrentWatchLimiter } from "./watchLimit";

const readLogsPage = (input: {
  auth: ApiKeyAuthContext;
  instanceId: string;
  limit?: number;
  cursor?: string;
  type?: "http" | "dns" | "smtp";
  sinceTimestamp?: number;
}) => {
  requireOwnedInstance(input.instanceId, input.auth);
  const cursor =
    input.cursor === undefined ? undefined : decodeLogsCursor(input.cursor);
  if (input.cursor !== undefined && cursor === undefined) {
    throw new Error("Invalid cursor");
  }

  const page = getLogsForInstancePage({
    instanceId: input.instanceId,
    limit: clampLogLimit(input.limit),
    cursor,
    type: input.type,
    sinceTimestamp: input.sinceTimestamp,
  });
  return {
    logs: page.logs,
    resumeCursor:
      page.resumeCursor === undefined
        ? input.cursor
        : encodeLogsCursor(page.resumeCursor),
    nextCursor:
      page.nextCursor === undefined
        ? undefined
        : encodeLogsCursor(page.nextCursor),
  };
};

const logsInputSchema = z.object({
  instanceId: z.string().min(1),
  limit: z.number().int().min(1).max(MAX_LOG_LIMIT).optional(),
  cursor: z.string().optional(),
  type: z.enum(["http", "dns", "smtp"]).optional(),
  sinceTimestamp: z.number().optional(),
});

const mcpLogWatchTimeoutMs = 20_000;
const mcpLogWatchLimiter = createConcurrentWatchLimiter({
  maxPerKey: 4,
  maxGlobal: 100,
});

export const registerLogTools = (server: McpServer) => {
  server.registerTool(
    "clear_instance_logs",
    {
      title: "Clear Instance Logs",
      description: "Clear all recorded interaction logs for an owned instance.",
      inputSchema: z.object({ instanceId: z.string().min(1) }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:write");
      requireOwnedInstance(instanceId, auth);
      clearLogsForInstance(instanceId);
      return jsonToolResult({ cleared: true });
    },
  );

  server.registerTool(
    "read_instance_logs",
    {
      title: "Read Instance Logs",
      description: "Read paginated HTTP/DNS/SMTP logs for an owned instance.",
      inputSchema: logsInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "logs:read");
      return jsonToolResult(readLogsPage({ ...input, auth }));
    },
  );

  server.registerTool(
    "watch_instance_logs",
    {
      title: "Watch Instance Logs",
      description:
        "Wait for new logs. Pass the returned resumeCursor as cursor on the next call; nextCursor only indicates another historical page is already available.",
      inputSchema: logsInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "logs:stream");
      requireOwnedInstance(input.instanceId, auth);
      const release = mcpLogWatchLimiter.acquire(auth.apiKey.id);
      if (release === undefined) {
        return toolError("Too many concurrent log watches");
      }

      const waiter = waitForInstanceLog(
        input.instanceId,
        mcpLogWatchTimeoutMs,
        extra.mcpReq.signal,
      );
      try {
        if (extra.mcpReq.signal.aborted) {
          return toolError("Log watch cancelled");
        }
        let page = readLogsPage({ ...input, auth });
        if (page.logs.length === 0) {
          await waiter.promise;
          if (extra.mcpReq.signal.aborted) {
            return toolError("Log watch cancelled");
          }
          page = readLogsPage({ ...input, auth });
        }
        return jsonToolResult({ ...page, pollAfterMs: 1000 });
      } finally {
        waiter.cancel();
        release();
      }
    },
  );
};
