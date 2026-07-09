import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  deleteInstance,
  getInstancesByOwner,
  getRecentLogsForInstance,
} from "../../storage";
import { createInstance, replaceInstance } from "../instances/service";
import { hasApiKeyScope } from "../apiKeyAuth";
import {
  getAuthContext,
  jsonToolResult,
  requireOwnedInstance,
  requireScope,
  serializeInstance,
  serializeInstanceSummary,
  toolError,
} from "./context";

const mcpLogPreviewLimit = 10;

export const registerInstanceTools = (server: McpServer) => {
  server.registerTool(
    "list_instances",
    {
      title: "List Instances",
      description:
        "List HTTP Workbench instances owned by the authenticated API key user. Use this first when the user refers to an existing instance but has not provided an instanceId. This is read-only and returns instance metadata plus public URLs, not full response bodies or logs.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:read");
      return jsonToolResult({
        instances: getInstancesByOwner(auth.user.id).map(
          serializeInstanceSummary,
        ),
      });
    },
  );

  server.registerTool(
    "create_instance",
    {
      title: "Create Instance",
      description:
        "Create a new HTTP Workbench instance that serves the provided raw HTTP response from a public instance URL. The raw input must be a complete valid HTTP response with status line, headers, blank line, and body.",
      inputSchema: {
        raw: z
          .string()
          .describe(
            "Complete raw HTTP response to serve, including status line, headers, blank line, and body.",
          ),
        label: z.string().max(100).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ raw, label }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:write");
      const result = createInstance({
        ownerId: auth.user.id,
        raw,
        label,
      });
      return result.ok
        ? jsonToolResult({ instance: serializeInstance(result.value) })
        : toolError(result.error.message);
    },
  );

  server.registerTool(
    "get_instance",
    {
      title: "Get Instance",
      description:
        "Get one owned HTTP Workbench instance, including its full configuration and a small recent log preview when the API key also has logs:read.",
      inputSchema: { instanceId: z.string().min(1) },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:read");
      const instance = requireOwnedInstance(instanceId, auth);
      const logs = hasApiKeyScope(auth.apiKey, "logs:read")
        ? getRecentLogsForInstance(instance.id, mcpLogPreviewLimit)
        : [];
      return jsonToolResult({ instance: serializeInstance(instance), logs });
    },
  );

  server.registerTool(
    "update_instance",
    {
      title: "Update Instance",
      description:
        "Replace the raw HTTP response served by an owned instance. Existing logs remain unchanged.",
      inputSchema: {
        instanceId: z.string().min(1),
        raw: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ instanceId, raw }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:write");
      const result = replaceInstance({
        instanceId,
        ownerId: auth.user.id,
        raw,
      });
      return result.ok
        ? jsonToolResult({ instance: serializeInstance(result.value) })
        : toolError(result.error.message);
    },
  );

  server.registerTool(
    "delete_instance",
    {
      title: "Delete Instance",
      description: "Delete an owned, unlocked HTTP Workbench instance.",
      inputSchema: { instanceId: z.string().min(1) },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ instanceId }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:delete");
      const instance = requireOwnedInstance(instanceId, auth);
      if (instance.locked) {
        return toolError("Instance is locked");
      }
      deleteInstance(instanceId);
      return jsonToolResult({ deleted: true });
    },
  );
};
