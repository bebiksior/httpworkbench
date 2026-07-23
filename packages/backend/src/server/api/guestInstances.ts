import { Elysia, status } from "elysia";
import { z } from "zod";
import {
  CreateGuestInstanceSchema,
  GUEST_CREATE_REQUESTS_PER_MINUTE,
  GuestInstanceSummariesRequestSchema,
  GUEST_OWNER_ID,
  InstanceDetailResponseSchema,
  InstanceIdSchema,
  RecentLogsPageResponseSchema,
  SetInstanceLockedSchema,
} from "shared";
import { instancePolicies } from "../../config";
import {
  clearLogsForInstance,
  deleteInstance,
  getInstanceById,
  getInstanceSummariesByIds,
  getRecentLogsForInstancePage,
  updateInstance,
} from "../../storage";
import {
  authenticateGuestInstance,
  authenticateGuestInstanceReferences,
  readGuestManagementToken,
} from "../guestAccess";
import {
  createGuestInstance,
  replaceGuestInstance,
} from "../instances/service";
import { createBoundedProtocolRateLimiter } from "../protocolRateLimit";
import { clampLogLimit, decodeLogsCursor, encodeLogsCursor } from "../utils";

const INSTANCE_DETAIL_LOG_LIMIT = 100;
const guestCreateRateLimiter = createBoundedProtocolRateLimiter({
  maxRequests: GUEST_CREATE_REQUESTS_PER_MINUTE,
  windowMs: 60_000,
  maxEntries: 10_000,
});
const guestApiRateLimiter = createBoundedProtocolRateLimiter({
  maxRequests: 300,
  windowMs: 60_000,
  maxEntries: 10_000,
});

const ParamsSchema = z.object({ id: InstanceIdSchema });
const RecentLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().max(256).optional(),
  type: z.enum(["http", "dns", "smtp"]).optional(),
});

const loadManagedGuestInstance = (id: string, request: Request) => {
  if (!authenticateGuestInstance(id, readGuestManagementToken(request))) {
    return { ok: false as const, error: status(404, { error: "Not found" }) };
  }
  const instance = getInstanceById(id);
  if (instance?.ownerId !== GUEST_OWNER_ID) {
    return { ok: false as const, error: status(404, { error: "Not found" }) };
  }
  return { ok: true as const, instance };
};

const clientRateLimitKey = (request: Request) =>
  request.headers.get("x-internal-real-ip") ?? "unknown";

const loadRecentLogs = (input: {
  instanceId: string;
  limit?: number;
  cursor?: string;
  type?: "http" | "dns" | "smtp";
}) => {
  const before =
    input.cursor === undefined ? undefined : decodeLogsCursor(input.cursor);
  if (input.cursor !== undefined && before === undefined) {
    return {
      ok: false as const,
      error: status(400, { error: "Invalid cursor" }),
    };
  }
  const page = getRecentLogsForInstancePage({
    instanceId: input.instanceId,
    limit: clampLogLimit(input.limit),
    before,
    type: input.type,
  });
  return {
    ok: true as const,
    page: RecentLogsPageResponseSchema.parse({
      logs: page.logs,
      olderLogsCursor:
        page.olderCursor === undefined
          ? undefined
          : encodeLogsCursor(page.olderCursor),
    }),
  };
};

export const guestInstancesRoutes = new Elysia({ name: "routes/guest" })
  .guard({ detail: { hide: true } })
  .onBeforeHandle(({ request }) => {
    if (!instancePolicies.allowGuest) {
      return status(403, { error: "Guest access is disabled" });
    }
    if (!guestApiRateLimiter.check(clientRateLimitKey(request), Date.now())) {
      return status(429, { error: "Guest API rate limit exceeded" });
    }
  })
  .post(
    "/api/guest/instances",
    ({ body, request }) => {
      if (
        !guestCreateRateLimiter.check(clientRateLimitKey(request), Date.now())
      ) {
        return status(429, { error: "Guest creation rate limit exceeded" });
      }
      const result = createGuestInstance(body.raw);
      return result.ok
        ? status(201, result.value)
        : status(result.error.status, { error: result.error.message });
    },
    { body: CreateGuestInstanceSchema },
  )
  .post(
    "/api/guest/instances/list",
    ({ body }) => {
      const ids = authenticateGuestInstanceReferences(body.instances);
      return getInstanceSummariesByIds(ids, GUEST_OWNER_ID);
    },
    { body: GuestInstanceSummariesRequestSchema },
  )
  .get(
    "/api/guest/instances/:id",
    ({ params, request }) => {
      const loaded = loadManagedGuestInstance(params.id, request);
      if (!loaded.ok) {
        return loaded.error;
      }
      const recent = loadRecentLogs({
        instanceId: loaded.instance.id,
        limit: INSTANCE_DETAIL_LOG_LIMIT,
      });
      if (!recent.ok) {
        return recent.error;
      }
      return InstanceDetailResponseSchema.parse({
        instance: loaded.instance,
        ...recent.page,
      });
    },
    { params: ParamsSchema },
  )
  .get(
    "/api/guest/instances/:id/logs/recent",
    ({ params, query, request }) => {
      const loaded = loadManagedGuestInstance(params.id, request);
      if (!loaded.ok) {
        return loaded.error;
      }
      const recent = loadRecentLogs({
        instanceId: loaded.instance.id,
        limit: query.limit,
        cursor: query.cursor,
        type: query.type,
      });
      return recent.ok ? recent.page : recent.error;
    },
    { params: ParamsSchema, query: RecentLogsQuerySchema },
  )
  .put(
    "/api/guest/instances/:id",
    ({ params, body, request }) => {
      const loaded = loadManagedGuestInstance(params.id, request);
      if (!loaded.ok) {
        return loaded.error;
      }
      const result = replaceGuestInstance(loaded.instance.id, body.raw);
      return result.ok
        ? result.value
        : status(result.error.status, { error: result.error.message });
    },
    { params: ParamsSchema, body: CreateGuestInstanceSchema },
  )
  .delete(
    "/api/guest/instances/:id",
    ({ params, request }) => {
      const loaded = loadManagedGuestInstance(params.id, request);
      if (!loaded.ok) {
        return loaded.error;
      }
      if (loaded.instance.locked) {
        return status(409, { error: "Instance is locked" });
      }
      deleteInstance(loaded.instance.id);
      return { message: "Deleted" };
    },
    { params: ParamsSchema },
  )
  .patch(
    "/api/guest/instances/:id/lock",
    ({ params, body, request }) => {
      const loaded = loadManagedGuestInstance(params.id, request);
      if (!loaded.ok) {
        return loaded.error;
      }
      const updated = updateInstance(loaded.instance.id, (inst) => ({
        ...inst,
        locked: body.locked,
      }));
      if (updated === undefined) {
        return status(404, { error: "Not found" });
      }
      return updated;
    },
    { params: ParamsSchema, body: SetInstanceLockedSchema },
  )
  .delete(
    "/api/guest/instances/:id/logs",
    ({ params, request }) => {
      const loaded = loadManagedGuestInstance(params.id, request);
      if (!loaded.ok) {
        return loaded.error;
      }
      clearLogsForInstance(loaded.instance.id);
      return { message: "Logs cleared" };
    },
    { params: ParamsSchema },
  );
