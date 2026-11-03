import type { McpServer } from "@modelcontextprotocol/server";
import {
  InstanceRouteSchema,
  MAX_INSTANCE_ROUTES,
  RouteMethodSchema,
  RoutePathSchema,
  type Instance,
} from "shared";
import * as z from "zod/v4";
import { dnsConfig, instancePolicies } from "../../config";
import {
  deleteInstance,
  deleteUnlockedInstancesMatching,
  getRecentLogsForInstance,
  listInstanceSummaries,
  updateInstance,
  type InstanceListCursor,
} from "../../storage";
import {
  createInstance,
  deleteInstanceRoute,
  extendInstance,
  replaceInstance,
  setInstanceLocked,
  setInstanceRoute,
  type InstanceServiceResult,
} from "../instances/service";
import { hasApiKeyScope } from "../apiKeyAuth";
import {
  getAuthContext,
  jsonToolResult,
  publicInstancePageUrl,
  requireOwnedInstance,
  requireScope,
  serializeInstance,
  serializeInstanceChange,
  serializeInstanceSummary,
  toolError,
} from "./context";

const mcpLogPreviewLimit = 10;
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const maxTtlDays = Math.floor(instancePolicies.maxTtlMs / dayMs);

const encodeListCursor = (cursor: InstanceListCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const ListCursorSchema = z.object({ createdAt: z.number(), id: z.string() });

const decodeListCursor = (cursor: string): InstanceListCursor | undefined => {
  try {
    return ListCursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    return undefined;
  }
};

const instanceResult = (result: InstanceServiceResult<Instance>) =>
  result.ok
    ? jsonToolResult({ instance: serializeInstanceChange(result.value) })
    : toolError(result.error.message);

const instanceFilterSchema = {
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("Case-insensitive substring of the label or instance ID."),
  labelPrefix: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe("Only instances whose label starts with this text."),
  hasLogs: z
    .boolean()
    .optional()
    .describe("true for instances that received traffic, false for unused."),
  createdByThisKey: z
    .boolean()
    .optional()
    .describe("Only instances created with the API key making this call."),
};

export const registerInstanceTools = (server: McpServer) => {
  server.registerTool(
    "list_instances",
    {
      title: "List Instances",
      description:
        "Find owned instances, newest first, to reuse one or to look up an instanceId. Paged with nextCursor. Returns metadata only, not responses or logs.",
      inputSchema: z.object({
        ...instanceFilterSchema,
        locked: z.boolean().optional(),
        createdAfter: z
          .number()
          .int()
          .optional()
          .describe("Unix time in milliseconds."),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().max(512).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ cursor, limit, createdByThisKey, ...filters }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:read");
      const after = cursor === undefined ? undefined : decodeListCursor(cursor);
      if (cursor !== undefined && after === undefined) {
        return toolError("Invalid cursor");
      }
      const page = listInstanceSummaries({
        ownerId: auth.user.id,
        filters: {
          ...filters,
          createdByApiKeyId:
            createdByThisKey === true ? auth.apiKey.id : undefined,
        },
        limit,
        after,
      });
      return jsonToolResult({
        total: page.total,
        instances: page.instances.map(serializeInstanceSummary),
        nextCursor:
          page.next === undefined ? undefined : encodeListCursor(page.next),
      });
    },
  );

  server.registerTool(
    "create_instance",
    {
      title: "Create Instance",
      description: `Create an instance at <id>.${dnsConfig.instancesDomain}. Reuse an existing instance when you can.`,
      inputSchema: z.object({
        raw: z
          .string()
          .describe(
            "Complete raw HTTP response to serve, including status line, headers, blank line, and body. Served for any path without a matching route.",
          ),
        routes: z
          .array(InstanceRouteSchema)
          .max(MAX_INSTANCE_ROUTES)
          .optional()
          .describe(
            "Different responses for specific request paths. Exact paths win over wildcards, longer paths over shorter ones.",
          ),
        label: z
          .string()
          .max(100)
          .optional()
          .describe(
            "Short name for the target and purpose, so the instance can be found and reused later.",
          ),
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
        openWorldHint: true,
      },
    },
    async ({ raw, routes, label, ttlHours }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:write");
      const result = createInstance({
        ownerId: auth.user.id,
        raw,
        routes,
        label,
        ttlMs: ttlHours * hourMs,
        createdByApiKeyId: auth.apiKey.id,
      });
      return instanceResult(result);
    },
  );

  server.registerTool(
    "get_instance",
    {
      title: "Get Instance",
      description:
        "Get one owned instance with its responses, plus its latest logs when the API key has logs:read.",
      inputSchema: z.object({ instanceId: z.string().min(1) }),
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
        "Replace what an owned instance serves. routes replaces the whole list ([] removes all); omitted fields are kept. To change one path, use set_instance_route.",
      inputSchema: z.object({
        instanceId: z.string().min(1),
        raw: z.string().optional(),
        routes: z
          .array(InstanceRouteSchema)
          .max(MAX_INSTANCE_ROUTES)
          .optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ instanceId, raw, routes }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:write");
      if (raw === undefined && routes === undefined) {
        return toolError("Provide raw, routes, or both");
      }
      return instanceResult(
        replaceInstance({ instanceId, ownerId: auth.user.id, raw, routes }),
      );
    },
  );

  server.registerTool(
    "set_instance_route",
    {
      title: "Set Path Response",
      description:
        "Serve a raw HTTP response for one path on an owned instance, replacing any existing one for the same method and path. Paths without a route get the instance's raw response.",
      inputSchema: z.object({
        instanceId: z.string().min(1),
        method: InstanceRouteSchema.shape.method,
        path: InstanceRouteSchema.shape.path,
        raw: InstanceRouteSchema.shape.raw,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ instanceId, method, path, raw }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:write");
      return instanceResult(
        setInstanceRoute({
          instanceId,
          ownerId: auth.user.id,
          route: { ...(method === undefined ? {} : { method }), path, raw },
        }),
      );
    },
  );

  server.registerTool(
    "delete_instance_route",
    {
      title: "Delete Path Response",
      description: "Remove one path's response from an owned instance.",
      inputSchema: z.object({
        instanceId: z.string().min(1),
        method: RouteMethodSchema.optional(),
        path: RoutePathSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ instanceId, method, path }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:write");
      return instanceResult(
        deleteInstanceRoute({
          instanceId,
          ownerId: auth.user.id,
          route: { method, path },
        }),
      );
    },
  );

  server.registerTool(
    "extend_instance",
    {
      title: "Extend Instance",
      description:
        "Move an owned instance's expiry to ttlDays from now. Never shortens it.",
      inputSchema: z.object({
        instanceId: z.string().min(1),
        ttlDays: z.number().int().min(1).max(maxTtlDays),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId, ttlDays }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:write");
      return instanceResult(
        extendInstance({
          instanceId,
          ownerId: auth.user.id,
          ttlMs: ttlDays * dayMs,
        }),
      );
    },
  );

  server.registerTool(
    "set_instance_public",
    {
      title: "Set Instance Visibility",
      description: `Publish or unpublish an owned instance. Anyone can view a published instance and its logs, read-only, at ${publicInstancePageUrl}.`,
      inputSchema: z.object({
        instanceId: z.string().min(1),
        public: z.boolean(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ instanceId, public: isPublic }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:write");
      requireOwnedInstance(instanceId, auth);
      const updated = updateInstance(instanceId, (instance) => ({
        ...instance,
        public: isPublic,
      }));
      return updated === undefined
        ? toolError("Instance not found")
        : jsonToolResult({ instance: serializeInstanceChange(updated) });
    },
  );

  server.registerTool(
    "set_instance_locked",
    {
      title: "Lock Instance",
      description: `Lock or unlock an owned instance. Locked instances cannot be deleted, and locking extends an expiring one to ${maxTtlDays} days. Lock instances that are evidence in a report.`,
      inputSchema: z.object({
        instanceId: z.string().min(1),
        locked: z.boolean(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ instanceId, locked }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:write");
      return instanceResult(
        setInstanceLocked({ instanceId, ownerId: auth.user.id, locked }),
      );
    },
  );

  server.registerTool(
    "delete_instance",
    {
      title: "Delete Instance",
      description:
        "Delete an owned instance and its logs. Locked instances must be unlocked first.",
      inputSchema: z.object({ instanceId: z.string().min(1) }),
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
        return toolError(
          "Instance is locked. Unlock it with set_instance_locked before deleting.",
        );
      }
      deleteInstance(instanceId);
      return jsonToolResult({ deleted: true });
    },
  );

  server.registerTool(
    "delete_instances",
    {
      title: "Delete Instances",
      description:
        "Delete all owned, unlocked instances matching the filters, with their logs. Needs at least one filter. Use dryRun to preview.",
      inputSchema: z.object({
        ...instanceFilterSchema,
        createdBefore: z
          .number()
          .int()
          .optional()
          .describe("Unix time in milliseconds."),
        maxLogCount: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Only instances with at most this many logs."),
        dryRun: z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dryRun, createdByThisKey, ...filters }, extra) => {
      const auth = getAuthContext(extra);
      requireScope(auth, "instances:delete");
      const hasFilter =
        createdByThisKey === true ||
        Object.values(filters).some((value) => value !== undefined);
      if (!hasFilter) {
        return toolError(
          "Provide at least one filter: query, labelPrefix, hasLogs, createdByThisKey, createdBefore or maxLogCount.",
        );
      }
      const ids = deleteUnlockedInstancesMatching({
        ownerId: auth.user.id,
        filters: {
          ...filters,
          createdByApiKeyId:
            createdByThisKey === true ? auth.apiKey.id : undefined,
        },
        dryRun,
      });
      return jsonToolResult(
        dryRun
          ? { wouldDelete: ids.length, ids }
          : { deleted: ids.length, ids },
      );
    },
  );
};
