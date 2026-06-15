import { Elysia, status } from "elysia";
import { z } from "zod";
import {
  CreateInstanceSchema,
  InstanceDetailResponseSchema,
  RenameInstanceSchema,
  SetInstanceLockedSchema,
  SetInstancePublicSchema,
  UpdateInstanceSchema,
} from "shared";
import {
  addInstance,
  clearLogsForInstance,
  deleteInstance,
  getInstanceById,
  getInstancesByOwner,
  getLogsForInstance,
  getLogsForInstancePage,
  getWebhooksByOwner,
  updateInstance,
} from "../../storage";
import { instancePolicies } from "../../config";
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
  clampLogLimit,
  decodeLogsCursor,
  encodeLogsCursor,
  generateInstanceID,
  validateStaticRaw,
} from "../utils";

const LogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().optional(),
  type: z.enum(["http", "dns"]).optional(),
  sinceTimestamp: z.coerce.number().int().min(0).optional(),
});

const ensureOwnedWebhookIds = (
  ownerId: string,
  webhookIds: string[],
): { ok: true; ids: string[] } | { ok: false } => {
  if (webhookIds.length === 0) {
    return { ok: true, ids: [] };
  }
  const ownedIds = new Set(
    getWebhooksByOwner(ownerId).map((webhook) => webhook.id),
  );
  for (const webhookId of webhookIds) {
    if (!ownedIds.has(webhookId)) {
      return { ok: false };
    }
  }
  return { ok: true, ids: webhookIds };
};

const loadOwnedInstance = (id: string, userId: string) => {
  const current = getInstanceById(id);
  if (current === undefined) {
    return { ok: false as const, res: status(404, { error: "Not found" }) };
  }
  if (current.ownerId !== userId) {
    return { ok: false as const, res: status(403, { error: "Forbidden" }) };
  }
  return { ok: true as const, instance: current };
};

export const instancesRoutes = new Elysia({ name: "routes/instances" })
  .use(authPlugin)
  .get("/api/instances", ({ user }) => getInstancesByOwner(user.id), {
    scope: "instances:read",
    detail: {
      tags: ["Instances"],
      summary: "List instances",
      description: "List every instance owned by the key's user.",
    },
  })
  .post(
    "/api/instances",
    ({ body, user }) => {
      let staticRaw: string | undefined;
      if (body.kind === "static") {
        const check = validateStaticRaw(body.raw);
        if (!check.ok) {
          return status(check.status, { error: check.error });
        }
        staticRaw = check.raw;
      }

      const webhooks = ensureOwnedWebhookIds(user.id, body.webhookIds ?? []);
      if (!webhooks.ok) {
        return status(400, { error: "Invalid webhook selection" });
      }

      if (
        instancePolicies.maxInstancesPerOwner !== undefined &&
        getInstancesByOwner(user.id).length >=
          instancePolicies.maxInstancesPerOwner
      ) {
        return status(403, { error: "Instance limit reached" });
      }

      const now = Date.now();
      const base = {
        id: generateInstanceID(),
        ownerId: user.id,
        createdAt: now,
        public: false,
        locked: false,
        expiresAt:
          instancePolicies.defaultTtlMs === undefined
            ? undefined
            : now + instancePolicies.defaultTtlMs,
        webhookIds: webhooks.ids,
      } as const;

      const created =
        body.kind === "static"
          ? addInstance({ kind: "static", ...base, raw: staticRaw ?? body.raw })
          : addInstance({
              kind: "dynamic",
              ...base,
              processors: body.processors,
            });
      return status(201, created);
    },
    {
      scope: "instances:write",
      body: CreateInstanceSchema,
      detail: {
        tags: ["Instances"],
        summary: "Create an instance",
        description:
          "Create an instance that serves the given raw HTTP response from a public URL.",
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
      const logs = includeLogs ? getLogsForInstance(instance.id) : [];
      return InstanceDetailResponseSchema.parse({ instance, logs });
    },
    {
      detail: {
        tags: ["Instances"],
        summary: "Get an instance",
        description:
          "Get one instance and its logs. Logs are included for public instances, or when the key holds logs:read.",
      },
    },
  )
  .put(
    "/api/instances/:id",
    ({ params, body, user }) => {
      const loaded = loadOwnedInstance(params.id, user.id);
      if (!loaded.ok) {
        return loaded.res;
      }
      if (body.kind !== loaded.instance.kind) {
        return status(400, { error: "Kind mismatch" });
      }

      let staticRaw: string | undefined;
      if (body.kind === "static") {
        const check = validateStaticRaw(body.raw);
        if (!check.ok) {
          return status(check.status, { error: check.error });
        }
        staticRaw = check.raw;
      }

      let nextWebhookIds: string[] | undefined;
      if (body.webhookIds !== undefined) {
        const webhooks = ensureOwnedWebhookIds(user.id, body.webhookIds);
        if (!webhooks.ok) {
          return status(400, { error: "Invalid webhook selection" });
        }
        nextWebhookIds = webhooks.ids;
      }

      const updated = updateInstance(params.id, (inst) => {
        if (inst.kind === "static" && body.kind === "static") {
          return {
            ...inst,
            raw: staticRaw ?? body.raw,
            webhookIds: nextWebhookIds ?? inst.webhookIds,
          };
        }
        if (inst.kind === "dynamic" && body.kind === "dynamic") {
          return {
            ...inst,
            processors: body.processors,
            webhookIds: nextWebhookIds ?? inst.webhookIds,
          };
        }
        return inst;
      });

      if (updated === undefined) {
        return status(404, { error: "Not found" });
      }
      return updated;
    },
    {
      scope: "instances:write",
      body: UpdateInstanceSchema,
      detail: {
        tags: ["Instances"],
        summary: "Replace an instance",
        description: "Replace an owned instance. The kind must match.",
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
      if (instancePolicies.maxTtlMs === undefined) {
        return status(400, { error: "Instance expiration is disabled" });
      }
      const loaded = loadOwnedInstance(params.id, user.id);
      if (!loaded.ok) {
        return loaded.res;
      }
      const nextExpiration = Date.now() + instancePolicies.maxTtlMs;
      const extended = updateInstance(params.id, (inst) => ({
        ...inst,
        expiresAt: nextExpiration,
      }));
      if (extended === undefined) {
        return status(404, { error: "Not found" });
      }
      return extended;
    },
    {
      scope: "instances:write",
      detail: {
        tags: ["Instances"],
        summary: "Extend instance expiration",
        description:
          "Reset the instance's expiration to the maximum TTL from now.",
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
          "Read a page of HTTP/DNS logs (oldest first). Page with nextCursor.",
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
      const loaded = loadOwnedInstance(params.id, user.id);
      if (!loaded.ok) {
        return loaded.res;
      }
      const updated = updateInstance(params.id, (inst) => ({
        ...inst,
        locked: body.locked,
      }));
      if (updated === undefined) {
        return status(404, { error: "Not found" });
      }
      return updated;
    },
    {
      scope: "instances:write",
      body: SetInstanceLockedSchema,
      detail: {
        tags: ["Instances"],
        summary: "Lock or unlock an instance",
        description: "Locked instances cannot be deleted.",
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
