import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import * as z from "zod/v4";
import type { ApiKeyAuthContext } from "./apiKeyAuth";
import { authenticateApiKeyRequest, hasApiKeyScope } from "./apiKeyAuth";
import {
  addInstance,
  clearLogsForInstance,
  deleteInstance,
  getInstanceById,
  getInstancesByOwner,
  getLogsForInstancePage,
  getRecentLogsForInstance,
  updateInstance,
  type LogsPageCursor,
} from "../storage";
import { instancePolicies } from "../config";
import { createFixedWindowRateLimiter } from "./rateLimit";
import {
  ensureStaticResponseWithinLimit,
  ensureValidStaticHttpRaw,
  generateInstanceID,
  normalizeStaticHttpRaw,
} from "./utils";

const mcpLogPreviewLimit = 10;
const defaultLogLimit = 50;
const maxLogLimit = 500;
const mcpRateLimitWindowMs = 60_000;
const mcpRateLimitMaxRequests = 120;
const unauthMcpRateLimitMaxRequests = 600;
const mcpServerInstructions = `
HTTP Workbench helps pentesters and security researchers create temporary hosted HTTP proof-of-concept pages and observe HTTP/DNS interactions for authorized security testing.

An instance is a hosted subdomain under the configured instances domain. Static instances serve an exact raw HTTP response and record incoming HTTP requests. Deployments with DNS enabled also record DNS lookups for instance hostnames.

Use these tools when the user needs a hosted page, a separate origin, a callback/redirect receiver, a custom raw HTTP response, or interaction logs for a specific HTTP Workbench instance.

Instance URLs returned by tools are public network endpoints; anyone who can reach the URL can trigger logs and receive the configured response.

Create and update tools require a complete raw HTTP response: status line, headers, a blank line, and body. They normalize line endings, enforce response size limits, and reject invalid HTTP.

Use watch_instance_logs by polling again with nextCursor after pollAfterMs when the user is actively waiting for new interactions.
`.trim();

const mcpRateLimiter = createFixedWindowRateLimiter({
  maxRequests: mcpRateLimitMaxRequests,
  windowMs: mcpRateLimitWindowMs,
});
const unauthMcpRateLimiter = createFixedWindowRateLimiter({
  maxRequests: unauthMcpRateLimitMaxRequests,
  windowMs: mcpRateLimitWindowMs,
});

const frontendUrl = Bun.env.FRONTEND_URL;
const configuredDomain = Bun.env.DOMAIN;

const allowedOrigins = new Set(
  [frontendUrl, "http://localhost:5173", "http://127.0.0.1:5173"].filter(
    (value): value is string => value !== undefined && value !== "",
  ),
);

const allowedHosts = new Set(
  [
    configuredDomain,
    frontendUrl === undefined || frontendUrl === ""
      ? undefined
      : new URL(frontendUrl).host,
    "localhost",
    "127.0.0.1",
    "localhost:8081",
    "127.0.0.1:8081",
  ].filter((value): value is string => value !== undefined && value !== ""),
);

const jsonToolResult = (value: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
});

const toolError = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

const unauthorizedResponse = () =>
  new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Bearer realm="httpworkbench-mcp"',
    },
  });

const validateMcpHeaders = (req: Request): Response | undefined => {
  const host = req.headers.get("host");
  if (host === null || !allowedHosts.has(host)) {
    return new Response("Invalid host", { status: 403 });
  }

  const origin = req.headers.get("origin");
  if (origin !== null && !allowedOrigins.has(origin)) {
    return new Response("Invalid origin", { status: 403 });
  }

  return undefined;
};

const getAuthContext = (extra: { authInfo?: AuthInfo }): ApiKeyAuthContext => {
  const context = extra.authInfo?.extra?.httpworkbenchAuth;
  if (context === undefined) {
    throw new Error("Unauthorized");
  }
  return context as ApiKeyAuthContext;
};

const requireScope = (
  auth: ApiKeyAuthContext,
  scope:
    | "instances:read"
    | "instances:write"
    | "instances:delete"
    | "logs:read"
    | "logs:stream",
) => {
  if (!hasApiKeyScope(auth.apiKey, scope)) {
    throw new Error(`Missing API key scope: ${scope}`);
  }
};

const getOwnedInstance = (instanceId: string, auth: ApiKeyAuthContext) => {
  const instance = getInstanceById(instanceId);
  if (instance?.ownerId !== auth.user.id) {
    throw new Error("Instance not found");
  }
  return instance;
};

const serializeInstance = (instance: ReturnType<typeof getInstanceById>) => {
  if (instance === undefined) {
    return undefined;
  }
  return {
    ...instance,
    url: `${instance.id}.${Bun.env.INSTANCES_DOMAIN ?? ""}`,
  };
};

const serializeInstanceSummary = (
  instance: ReturnType<typeof getInstanceById>,
) => {
  if (instance === undefined) {
    return undefined;
  }
  return {
    id: instance.id,
    kind: instance.kind,
    ownerId: instance.ownerId,
    createdAt: instance.createdAt,
    expiresAt: instance.expiresAt,
    label: instance.label,
    public: instance.public,
    locked: instance.locked,
    url: `${instance.id}.${Bun.env.INSTANCES_DOMAIN ?? ""}`,
  };
};

const encodeCursor = (cursor: LogsPageCursor): string => {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
};

const decodeCursor = (cursor: string): LogsPageCursor | undefined => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      decoded !== null &&
      typeof decoded === "object" &&
      typeof decoded.seq === "number" &&
      Number.isInteger(decoded.seq) &&
      decoded.seq >= 0
    ) {
      return { seq: decoded.seq };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const readLogsPage = (input: {
  auth: ApiKeyAuthContext;
  instanceId: string;
  limit?: number;
  cursor?: string;
  type?: "http" | "dns";
  sinceTimestamp?: number;
}) => {
  getOwnedInstance(input.instanceId, input.auth);
  const limit = Math.min(
    Math.max(input.limit ?? defaultLogLimit, 1),
    maxLogLimit,
  );
  const cursor =
    input.cursor === undefined ? undefined : decodeCursor(input.cursor);
  if (input.cursor !== undefined && cursor === undefined) {
    throw new Error("Invalid cursor");
  }

  const page = getLogsForInstancePage({
    instanceId: input.instanceId,
    limit,
    cursor,
    type: input.type,
    sinceTimestamp: input.sinceTimestamp,
  });

  return {
    logs: page.logs,
    nextCursor:
      page.nextCursor === undefined ? undefined : encodeCursor(page.nextCursor),
  };
};

const createMcpServer = () => {
  const server = new McpServer(
    {
      name: "httpworkbench",
      version: "1.0.0",
    },
    {
      instructions: mcpServerInstructions,
    },
  );

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
        "Create a new static HTTP Workbench instance that serves the provided raw HTTP response from a public instance URL. Use this when the user needs a new hosted PoC page, callback receiver, redirect target, CORS test endpoint, separate origin, or other temporary hosted surface. Side effects: persists a new instance owned by the API key user, consumes instance quota, creates a reachable public endpoint, and future requests or DNS lookups for that endpoint may be logged. The raw input must be a complete valid HTTP response with status line, headers, blank line, and body.",
      inputSchema: {
        raw: z
          .string()
          .describe(
            "Complete raw HTTP response to serve, including status line, headers, blank line, and body. Example: HTTP/1.1 200 OK\\r\\nContent-Type: text/html\\r\\n\\r\\n<html>...</html>",
          ),
        label: z
          .string()
          .max(100)
          .optional()
          .describe(
            "Optional human-readable label for the instance, used only for organization.",
          ),
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

      const normalizedRaw = normalizeStaticHttpRaw(raw);
      const limitCheck = ensureStaticResponseWithinLimit(normalizedRaw);
      if (limitCheck.kind === "error") {
        return toolError(await limitCheck.response.text());
      }
      const httpCheck = ensureValidStaticHttpRaw(normalizedRaw);
      if (httpCheck.kind === "error") {
        return toolError(await httpCheck.response.text());
      }

      if (instancePolicies.maxInstancesPerOwner !== undefined) {
        const ownedInstances = getInstancesByOwner(auth.user.id);
        if (ownedInstances.length >= instancePolicies.maxInstancesPerOwner) {
          return toolError("Instance limit reached");
        }
      }

      const now = Date.now();
      const instance = addInstance({
        id: generateInstanceID(),
        ownerId: auth.user.id,
        createdAt: now,
        expiresAt:
          instancePolicies.ttlMs === undefined
            ? undefined
            : now + instancePolicies.ttlMs,
        webhookIds: [],
        label,
        public: false,
        locked: false,
        kind: "static",
        raw: normalizedRaw,
      });

      return jsonToolResult({ instance: serializeInstance(instance) });
    },
  );

  server.registerTool(
    "get_instance",
    {
      title: "Get Instance",
      description:
        "Get one owned HTTP Workbench instance, including its full configuration and a small recent log preview when the API key also has logs:read. Use this to inspect the current hosted response, URL, lock/public flags, expiration, or recent interactions before deciding whether to update, delete, or read more logs. This is read-only and only returns instances owned by the API key user.",
      inputSchema: {
        instanceId: z
          .string()
          .min(1)
          .describe(
            "ID of the HTTP Workbench instance to inspect, usually the leftmost label of its instance URL.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:read");
      const instance = getOwnedInstance(instanceId, auth);
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
        "Replace the raw HTTP response served by an owned static instance. Use this when the user wants to revise an existing hosted PoC or change the behavior of an existing instance URL instead of creating a new one. Side effects: overwrites the response seen by future visitors to that public URL; existing logs remain unchanged. Only static instances can be updated through MCP. The raw input must be a complete valid HTTP response with status line, headers, blank line, and body.",
      inputSchema: {
        instanceId: z
          .string()
          .min(1)
          .describe("ID of the owned static instance to update."),
        raw: z
          .string()
          .describe(
            "Complete replacement raw HTTP response to serve, including status line, headers, blank line, and body.",
          ),
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
      const current = getOwnedInstance(instanceId, auth);
      if (current.kind !== "static") {
        return toolError("Only static instances can be updated through MCP");
      }

      const normalizedRaw = normalizeStaticHttpRaw(raw);
      const limitCheck = ensureStaticResponseWithinLimit(normalizedRaw);
      if (limitCheck.kind === "error") {
        return toolError(await limitCheck.response.text());
      }
      const httpCheck = ensureValidStaticHttpRaw(normalizedRaw);
      if (httpCheck.kind === "error") {
        return toolError(await httpCheck.response.text());
      }

      const updated = updateInstance(instanceId, (instance) => ({
        ...instance,
        raw: normalizedRaw,
      }));
      return jsonToolResult({ instance: serializeInstance(updated) });
    },
  );

  server.registerTool(
    "delete_instance",
    {
      title: "Delete Instance",
      description:
        "Delete an owned, unlocked HTTP Workbench instance. Use this only when the user wants to remove a hosted endpoint and its associated data from HTTP Workbench. Side effects: removes the instance, stops serving its public URL, and cascades deletion of related instance data such as logs according to storage rules. Locked instances cannot be deleted.",
      inputSchema: {
        instanceId: z
          .string()
          .min(1)
          .describe("ID of the owned, unlocked instance to delete."),
      },
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
      const instance = getOwnedInstance(instanceId, auth);
      if (instance.locked) {
        return toolError("Instance is locked");
      }
      deleteInstance(instanceId);
      return jsonToolResult({ deleted: true });
    },
  );

  server.registerTool(
    "clear_instance_logs",
    {
      title: "Clear Instance Logs",
      description:
        "Clear all recorded HTTP/DNS logs for an owned instance while leaving the hosted instance itself intact. Use this when the user wants a clean slate before reproducing an interaction. Side effects: permanently removes stored logs for the instance; it does not change the served response or public URL.",
      inputSchema: {
        instanceId: z
          .string()
          .min(1)
          .describe("ID of the owned instance whose logs should be cleared."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "logs:read");
      getOwnedInstance(instanceId, auth);
      clearLogsForInstance(instanceId);
      return jsonToolResult({ cleared: true });
    },
  );

  server.registerTool(
    "read_instance_logs",
    {
      title: "Read Instance Logs",
      description:
        "Read historical paginated HTTP/DNS interaction logs for an owned instance. Use this when the user asks what requests, callbacks, DNS lookups, headers, paths, bodies, or source addresses reached an instance. This is read-only, but returned logs can contain sensitive request data. Use nextCursor to fetch additional pages.",
      inputSchema: {
        instanceId: z
          .string()
          .min(1)
          .describe("ID of the owned instance whose logs should be read."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(maxLogLimit)
          .optional()
          .describe(`Maximum number of logs to return, up to ${maxLogLimit}.`),
        cursor: z
          .string()
          .optional()
          .describe("Opaque cursor returned by a previous log read."),
        type: z
          .enum(["http", "dns"])
          .optional()
          .describe("Optional log type filter."),
        sinceTimestamp: z
          .number()
          .optional()
          .describe(
            "Optional Unix timestamp in milliseconds; only newer logs are returned.",
          ),
      },
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
        "Poll for new HTTP/DNS logs from an owned instance while the user is waiting for an interaction to arrive. This is read-only, but returned logs can contain sensitive request data. Call again after pollAfterMs using the returned nextCursor to continue watching without replaying older entries.",
      inputSchema: {
        instanceId: z
          .string()
          .min(1)
          .describe("ID of the owned instance whose logs should be watched."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(maxLogLimit)
          .optional()
          .describe(
            `Maximum number of new logs to return, up to ${maxLogLimit}.`,
          ),
        cursor: z
          .string()
          .optional()
          .describe(
            "Opaque cursor returned by a previous log read or watch call.",
          ),
        type: z
          .enum(["http", "dns"])
          .optional()
          .describe("Optional log type filter."),
        sinceTimestamp: z
          .number()
          .optional()
          .describe(
            "Optional Unix timestamp in milliseconds; only newer logs are returned.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "logs:stream");
      return jsonToolResult({
        ...readLogsPage({ ...input, auth }),
        pollAfterMs: 1000,
      });
    },
  );

  return server;
};

export const handleMcpRequest = async (req: Request): Promise<Response> => {
  const headerError = validateMcpHeaders(req);
  if (headerError !== undefined) {
    return headerError;
  }

  const auth = authenticateApiKeyRequest(req);
  if (auth === undefined) {
    if (!unauthMcpRateLimiter.check("unauthenticated")) {
      return new Response("Rate limit exceeded", { status: 429 });
    }
    return unauthorizedResponse();
  }

  if (!mcpRateLimiter.check(auth.apiKey.id)) {
    return new Response("Rate limit exceeded", { status: 429 });
  }

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(req, {
      authInfo: {
        token: auth.apiKey.id,
        clientId: auth.apiKey.id,
        scopes: auth.apiKey.scopes,
        expiresAt:
          auth.apiKey.expiresAt === undefined
            ? undefined
            : Math.floor(auth.apiKey.expiresAt / 1000),
        extra: {
          httpworkbenchAuth: auth,
        },
      },
    });
  } finally {
    await transport.close();
    await server.close();
  }
};
