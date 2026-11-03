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
  serializeInstanceSummary,
  toolError,
} from "./context";

const mcpLogPreviewLimit = 10;
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const maxTtlDays = Math.floor(instancePolicies.maxTtlMs / dayMs);

const encodeListCursor = (cursor: InstanceListCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeListCursor = (cursor: string): InstanceListCursor | undefined => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      typeof decoded?.createdAt === "number" &&
      typeof decoded?.id === "string"
    ) {
      return { createdAt: decoded.createdAt, id: decoded.id };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const reuseTip = (id: string) =>
  `Reuse this instance for related probes: any <token>.${id}.${dnsConfig.instancesDomain} hostname and any URL path log here, and set_instance_route serves a different response per path.`;

const instanceResult = (result: InstanceServiceResult<Instance>) =>
  result.ok
    ? jsonToolResult({ instance: serializeInstance(result.value) })
    : toolError(result.error.message);

const instanceFilterSchema = {
  query: z
    .string()
    .max(200)
    .optional()
    .describe("Case-insensitive substring of the label or instance ID."),
  labelPrefix: z
    .string()
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
        "Find owned instances, newest first. Use it to reuse an existing instance before creating one, or to find an instanceId the user refers to. Filter with query or labelPrefix; results are paged with nextCursor and include total. Returns metadata only, not response bodies or logs.",
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
      description: `Create a new instance that serves the provided raw HTTP response at <id>.${dnsConfig.instancesDomain}. Prefer reusing an instance you already have: every subdomain and path of an instance logs to it, and set_instance_route adds per-path responses. Optional routes serve different responses per request path, with raw as the fallback. Instances expire after 72 hours by default; use extend_instance later if you need longer.`,
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
      return result.ok
        ? jsonToolResult({
            instance: serializeInstance(result.value),
            tip: reuseTip(result.value.id),
          })
        : toolError(result.error.message);
    },
  );

  server.registerTool(
    "get_instance",
    {
      title: "Get Instance",
      description:
        "Get one owned HTTP Workbench instance, including its responses, routes and a small recent log preview when the API key also has logs:read.",
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
        "Change what an owned instance serves. raw replaces the fallback response; routes replaces the whole list of per-path responses (pass [] to remove them all). Omitted fields stay as they are. To add or change one path, use set_instance_route. Existing logs remain unchanged.",
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
        "Serve a specific raw HTTP response for one request path on an owned instance, replacing any existing response for the same method and path. Use it for redirect chains, content-type or status variants and multi-step PoCs on one instance instead of creating more instances. Requests that match no route get the instance's fallback raw response.",
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
      description:
        "Remove a per-path response from an owned instance. Requests to that path then get the fallback raw response.",
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
      description: `Keep an owned instance alive longer: its expiry moves to ttlDays from now (up to ${maxTtlDays}). It never shortens the current lifetime. Instances without an expiry are unchanged.`,
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
      description: `Publish or unpublish an owned HTTP Workbench instance. When published, an unauthenticated user can visit ${publicInstancePageUrl} and view its logs and basic data. Access is read-only. Publishing is useful for sharing callback information with a triager in a vulnerability report.`,
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
        : jsonToolResult({ instance: serializeInstance(updated) });
    },
  );

  server.registerTool(
    "set_instance_locked",
    {
      title: "Lock Instance",
      description: `Lock or unlock an owned instance. Lock an instance once it is evidence, for example referenced in a vulnerability report or a triager conversation. A locked instance cannot be deleted by delete_instance or delete_instances, and locking an expiring instance extends it to the maximum lifetime (${maxTtlDays} days from now). Locking does not block updating responses, changing visibility, or clearing logs.`,
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
        "Delete an owned HTTP Workbench instance and its logs. Fails if the instance is locked; unlock it with set_instance_locked first.",
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
        "Delete several owned instances and their logs at once, for example everything with a run's label prefix when the run is done, or unused instances. At least one filter is required. Locked instances are never deleted. Use dryRun to preview the matching IDs first.",
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
        Object.values(filters).some((value) =>
          typeof value === "string" ? value.trim() !== "" : value !== undefined,
        );
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
