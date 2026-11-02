import { Elysia, status } from "elysia";
import { z } from "zod";
import {
  CreateInstanceSchema,
  GUEST_OWNER_ID,
  InstanceDetailResponseSchema,
  RecentLogsPageResponseSchema,
  RenameInstanceSchema,
  SetInstanceLockedSchema,
  SetInstancePublicSchema,
  UpdateInstanceSchema,
} from "shared";
import {
  clearLogsForInstance,
  deleteInstance,
  deleteUnlockedInstancesMatching,
  getInstanceById,
  getInstanceSummariesByOwner,
  getRecentLogsForInstancePage,
  getLogsForInstancePage,
  updateInstance,
} from "../../storage";
import {
  apiKeyMissingScope,
  authPlugin,
  enforceApiKeyRateLimit,
  insufficientScopeResponse,
  readSessionCookie,
  resolveOptionalAccess,
} from "../auth";
import { canReadInstance } from "../instances/access";
import {
  createInstance,
  extendInstance,
  getOwnedInstance,
  replaceInstance,
  setInstanceLocked,
  type InstanceServiceError,
} from "../instances/service";
import { clampLogLimit, decodeLogsCursor, encodeLogsCursor } from "../utils";

const LogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().max(256).optional(),
  type: z.enum(["http", "dns", "smtp"]).optional(),
  sinceTimestamp: z.coerce.number().int().min(0).optional(),
});

const RecentLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().max(256).optional(),
  type: z.enum(["http", "dns", "smtp"]).optional(),
});

const booleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

const BulkDeleteQuerySchema = z.object({
  query: z.string().max(200).optional(),
  labelPrefix: z.string().max(100).optional(),
  createdBefore: z.coerce.number().int().min(0).optional(),
  maxLogCount: z.coerce.number().int().min(0).optional(),
  hasLogs: booleanQuery,
  createdByThisKey: booleanQuery,
  dryRun: booleanQuery,
});

const INSTANCE_DETAIL_LOG_LIMIT = 100;

const serviceErrorResponse = (error: InstanceServiceError) =>
  status(error.status, { error: error.message });

const loadOwnedInstance = (id: string, userId: string) => {
  const result = getOwnedInstance(id, userId);
  if (!result.ok) {
    return { ok: false as const, res: serviceErrorResponse(result.error) };
  }
  return { ok: true as const, instance: result.value };
};

export const instancesRoutes = new Elysia({ name: "routes/instances" })
  .use(authPlugin)
  .get("/api/instances", ({ user }) => getInstanceSummariesByOwner(user.id), {
    scope: "instances:read",
    detail: {
      tags: ["Instances"],
      summary: "List instances",
      description: "List every instance owned by the key's user.",
    },
  })
  .post(
    "/api/instances",
    ({ body, user, access }) => {
      const result = createInstance({
        ownerId: user.id,
        raw: body.raw,
        routes: body.routes,
        webhookIds: body.webhookIds,
        createdByApiKeyId:
          access.via === "api_key" ? access.apiKey.id : undefined,
      });
      return result.ok
        ? status(201, result.value)
        : serviceErrorResponse(result.error);
    },
    {
      scope: "instances:write",
      body: CreateInstanceSchema,
      detail: {
        tags: ["Instances"],
        summary: "Create an instance",
        description:
          "Create an instance that serves the given raw HTTP response from a public URL. Optional routes serve different responses for specific request paths; raw is the fallback.",
      },
    },
  )
  .delete(
    "/api/instances",
    ({ user, access, query }) => {
      if (query.createdByThisKey === true && access.via !== "api_key") {
        return status(400, {
          error: "createdByThisKey requires API key authentication",
        });
      }
      const ids = deleteUnlockedInstancesMatching({
        ownerId: user.id,
        filters: {
          query: query.query,
          labelPrefix: query.labelPrefix,
          createdBefore: query.createdBefore,
          maxLogCount: query.maxLogCount,
          hasLogs: query.hasLogs,
          createdByApiKeyId:
            query.createdByThisKey === true && access.via === "api_key"
              ? access.apiKey.id
              : undefined,
        },
        dryRun: query.dryRun,
      });
      return query.dryRun === true
        ? { wouldDelete: ids.length, ids }
        : { deleted: ids.length, ids };
    },
    {
      scope: "instances:delete",
      query: BulkDeleteQuerySchema,
      detail: {
        tags: ["Instances"],
        summary: "Delete unlocked instances",
        description:
          "Delete unlocked instances owned by the key's user, optionally filtered. Without filters every unlocked instance is deleted. Locked instances are always kept. Use dryRun=true to preview.",
      },
    },
  )
  .get(
    "/api/instances/:id",
    async ({ params, request, cookie }) => {
      const instance = getInstanceById(params.id);
      if (instance === undefined) {
        return status(404, { error: "Not found" });
      }
      if (instance.ownerId === GUEST_OWNER_ID) {
        return status(404, { error: "Not found" });
      }

      const access = await resolveOptionalAccess(
        request,
        readSessionCookie(cookie),
      );
      if (!canReadInstance({ instance, user: access?.user })) {
        return status(404, { error: "Not found" });
      }
      if (!enforceApiKeyRateLimit(access)) {
        return status(429, { error: "Rate limit exceeded" });
      }

      const publiclyReadable = canReadInstance({ instance, user: undefined });
      if (!publiclyReadable && apiKeyMissingScope(access, "instances:read")) {
        return insufficientScopeResponse("instances:read");
      }

      const includeLogs =
        publiclyReadable || !apiKeyMissingScope(access, "logs:read");
      const page = includeLogs
        ? getRecentLogsForInstancePage({
            instanceId: instance.id,
            limit: INSTANCE_DETAIL_LOG_LIMIT,
          })
        : { logs: [], olderCursor: undefined };
      return InstanceDetailResponseSchema.parse({
        instance,
        logs: page.logs,
        olderLogsCursor:
          page.olderCursor === undefined
            ? undefined
            : encodeLogsCursor(page.olderCursor),
      });
    },
    {
      detail: {
        tags: ["Instances"],
        summary: "Get an instance",
        description:
          "Get one instance and its 100 most recent logs. Logs are included for public instances, or when the key holds logs:read.",
      },
    },
  )
  .put(
    "/api/instances/:id",
    ({ params, body, user }) => {
      const result = replaceInstance({
        instanceId: params.id,
        ownerId: user.id,
        raw: body.raw,
        routes: body.routes,
        webhookIds: body.webhookIds,
      });
      return result.ok ? result.value : serviceErrorResponse(result.error);
    },
    {
      scope: "instances:write",
      body: UpdateInstanceSchema,
      detail: {
        tags: ["Instances"],
        summary: "Replace an instance",
        description: "Replace an owned instance response.",
      },
    },
  )
  .delete(
    "/api/instances/:id",
    ({ params, user }) => {
      const loaded = loadOwnedInstance(params.id, user.id);
      if (!loaded.ok) {
        return loaded.res;
      }
      if (loaded.instance.locked) {
        return status(409, { error: "Instance is locked" });
      }
      deleteInstance(params.id);
      return { message: "Deleted" };
    },
    {
      scope: "instances:delete",
      detail: {
        tags: ["Instances"],
        summary: "Delete an instance",
        description: "Delete an owned, unlocked instance and its logs.",
      },
    },
  )
  .post(
    "/api/instances/:id/extend",
    ({ params, user }) => {
      const result = extendInstance({
        instanceId: params.id,
        ownerId: user.id,
      });
      return result.ok ? result.value : serviceErrorResponse(result.error);
    },
    {
      scope: "instances:write",
      detail: {
        tags: ["Instances"],
        summary: "Extend instance expiration",
        description:
          "Extend the instance's expiration to the maximum lifetime from now. Instances without an expiration are unchanged.",
      },
    },
  )
  .get(
    "/api/instances/:id/logs/recent",
    async ({ params, query, request, cookie }) => {
      const instance = getInstanceById(params.id);
      if (instance === undefined || instance.ownerId === GUEST_OWNER_ID) {
        return status(404, { error: "Not found" });
      }
      const access = await resolveOptionalAccess(
        request,
        readSessionCookie(cookie),
      );
      if (!canReadInstance({ instance, user: access?.user })) {
        return status(404, { error: "Not found" });
      }
      if (!enforceApiKeyRateLimit(access)) {
        return status(429, { error: "Rate limit exceeded" });
      }
      const publiclyReadable = canReadInstance({
        instance,
        user: undefined,
      });
      if (!publiclyReadable && apiKeyMissingScope(access, "logs:read")) {
        return insufficientScopeResponse("logs:read");
      }

      const before =
        query.cursor === undefined ? undefined : decodeLogsCursor(query.cursor);
      if (query.cursor !== undefined && before === undefined) {
        return status(400, { error: "Invalid cursor" });
      }
      const page = getRecentLogsForInstancePage({
        instanceId: instance.id,
        limit: clampLogLimit(query.limit),
        before,
        type: query.type,
      });
      return RecentLogsPageResponseSchema.parse({
        logs: page.logs,
        olderLogsCursor:
          page.olderCursor === undefined
            ? undefined
            : encodeLogsCursor(page.olderCursor),
      });
    },
    {
      query: RecentLogsQuerySchema,
      detail: {
        tags: ["Logs"],
        summary: "Read recent instance logs",
        description:
          "Read logs newest-page first and follow olderLogsCursor backward.",
      },
    },
  )
  .get(
    "/api/instances/:id/logs",
    ({ params, query, user }) => {
      const current = getInstanceById(params.id);
      if (current?.ownerId !== user.id) {
        return status(404, { error: "Not found" });
      }

      const cursor =
        query.cursor === undefined ? undefined : decodeLogsCursor(query.cursor);
      if (query.cursor !== undefined && cursor === undefined) {
        return status(400, { error: "Invalid cursor" });
      }

      const page = getLogsForInstancePage({
        instanceId: params.id,
        limit: clampLogLimit(query.limit),
        cursor,
        type: query.type,
        sinceTimestamp: query.sinceTimestamp,
      });
      return {
        logs: page.logs,
        nextCursor:
          page.nextCursor === undefined
            ? undefined
            : encodeLogsCursor(page.nextCursor),
      };
    },
    {
      scope: "logs:read",
      query: LogsQuerySchema,
      detail: {
        tags: ["Logs"],
        summary: "Read instance logs",
        description:
          "Read a page of HTTP/DNS/SMTP logs (oldest first). Page with nextCursor.",
      },
    },
  )
  .delete(
    "/api/instances/:id/logs",
    ({ params, user }) => {
      const loaded = loadOwnedInstance(params.id, user.id);
      if (!loaded.ok) {
        return loaded.res;
      }
      clearLogsForInstance(params.id);
      return { message: "Logs cleared" };
    },
    {
      scope: "instances:write",
      detail: {
        tags: ["Logs"],
        summary: "Clear instance logs",
        description: "Permanently remove all logs for an owned instance.",
      },
    },
  )
  .patch(
    "/api/instances/:id/rename",
    ({ params, body, user }) => {
      const loaded = loadOwnedInstance(params.id, user.id);
      if (!loaded.ok) {
        return loaded.res;
      }
      const updated = updateInstance(params.id, (inst) => ({
        ...inst,
        label: body.label,
      }));
      if (updated === undefined) {
        return status(404, { error: "Not found" });
      }
      return updated;
    },
    {
      scope: "instances:write",
      body: RenameInstanceSchema,
      detail: {
        tags: ["Instances"],
        summary: "Rename an instance",
        description: "Set or clear the instance label.",
      },
    },
  )
  .patch(
    "/api/instances/:id/lock",
    ({ params, body, user }) => {
      const result = setInstanceLocked({
        instanceId: params.id,
        ownerId: user.id,
        locked: body.locked,
      });
      return result.ok ? result.value : serviceErrorResponse(result.error);
    },
    {
      scope: "instances:write",
      body: SetInstanceLockedSchema,
      detail: {
        tags: ["Instances"],
        summary: "Lock or unlock an instance",
        description:
          "Locked instances cannot be deleted, individually or in bulk. Locking an expiring instance extends it to the maximum lifetime. It does not block other changes.",
      },
    },
  )
  .patch(
    "/api/instances/:id/public",
    ({ params, body, user }) => {
      const loaded = loadOwnedInstance(params.id, user.id);
      if (!loaded.ok) {
        return loaded.res;
      }
      const updated = updateInstance(params.id, (inst) => ({
        ...inst,
        public: body.public,
      }));
      if (updated === undefined) {
        return status(404, { error: "Not found" });
      }
      return updated;
    },
    {
      scope: "instances:write",
      body: SetInstancePublicSchema,
      detail: {
        tags: ["Instances"],
        summary: "Set instance visibility",
        description:
          "Public instances and their logs can be read by anyone with the ID.",
      },
    },
  );
