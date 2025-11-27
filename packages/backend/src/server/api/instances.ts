import type { BunRequest } from "bun";
import {
  CreateInstanceSchema,
  GUEST_OWNER_ID,
  InstanceDetailResponseSchema,
  RenameInstanceSchema,
  UpdateInstanceSchema,
} from "shared";
import {
  addInstance,
  clearLogsForInstance,
  deleteInstance,
  getInstanceById,
  getInstancesByOwner,
  getLogsForInstance,
  getWebhooksByOwner,
  updateInstance,
} from "../../storage";
import { instancePolicies } from "../../config";
import { withAuth } from "../auth";
import {
  ensureStaticResponseWithinLimit,
  generateInstanceID,
  parseJsonRequest,
} from "../utils";

type WebhookValidationSuccess = {
  kind: "ok";
  ids: string[];
};

type WebhookValidationError = {
  kind: "error";
  response: Response;
};

const ensureOwnedWebhookIds = async (
  ownerId: string,
  webhookIds: string[],
): Promise<WebhookValidationSuccess | WebhookValidationError> => {
  if (webhookIds.length === 0) {
    return { kind: "ok", ids: [] };
  }
  const ownedIds = new Set(
    (await getWebhooksByOwner(ownerId)).map((webhook) => webhook.id),
  );
  for (const webhookId of webhookIds) {
    if (!ownedIds.has(webhookId)) {
      return {
        kind: "error",
        response: Response.json(
          { error: "Invalid webhook selection" },
          { status: 400 },
        ),
      };
    }
  }
  return { kind: "ok", ids: webhookIds };
};

export const INSTANCES_ROUTES = {
  "/api/instances": {
    GET: withAuth(async (_req: BunRequest<"/api/instances">, user) => {
      const instances = await getInstancesByOwner(user.id);
      return Response.json(instances, { status: 200 });
    }),
    POST: withAuth(async (req: BunRequest<"/api/instances">, user) => {
      const parsed = await parseJsonRequest(req, CreateInstanceSchema);
      if (parsed.kind === "error") {
        return parsed.response;
      }

      if (parsed.data.kind === "static") {
        const limitCheck = ensureStaticResponseWithinLimit(parsed.data.raw);
        if (limitCheck.kind === "error") {
          return limitCheck.response;
        }
      }

      const validation = await ensureOwnedWebhookIds(
        user.id,
        parsed.data.webhookIds ?? [],
      );
      if (validation.kind === "error") {
        return validation.response;
      }

      if (instancePolicies.maxInstancesPerOwner !== undefined) {
        const ownedInstances = await getInstancesByOwner(user.id);
        if (ownedInstances.length >= instancePolicies.maxInstancesPerOwner) {
          return Response.json(
            { error: "Instance limit reached" },
            { status: 403 },
          );
        }
      }

      const now = Date.now();
      const base = {
        id: generateInstanceID(),
        ownerId: user.id,
        createdAt: now,
        expiresAt:
          instancePolicies.ttlMs === undefined
            ? undefined
            : now + instancePolicies.ttlMs,
      } as const;

      switch (parsed.data.kind) {
        case "static": {
          const created = await addInstance({
            kind: "static",
            ...base,
            raw: parsed.data.raw,
            webhookIds: validation.ids,
          });
          return Response.json(created, { status: 201 });
        }
        case "dynamic": {
          const created = await addInstance({
            kind: "dynamic",
            ...base,
            processors: parsed.data.processors,
            webhookIds: validation.ids,
          });
          return Response.json(created, { status: 201 });
        }
      }
    }),
  },
  "/api/instances/:id": {
    GET: withAuth(async (req: BunRequest<"/api/instances/:id">, user) => {
      const id = req.params.id;
      if (id === "") {
        return Response.json({ error: "Invalid id" }, { status: 400 });
      }

      const instance = await getInstanceById(id);
      if (instance === undefined) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (instance.ownerId !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const logs = await getLogsForInstance(instance.id);
      const response = InstanceDetailResponseSchema.parse({ instance, logs });
      return Response.json(response, { status: 200 });
    }),
    PUT: withAuth(async (req: BunRequest<"/api/instances/:id">, user) => {
      const id = req.params.id;
      if (id === "") {
        return Response.json({ error: "Invalid id" }, { status: 400 });
      }

      const current = await getInstanceById(id);
      if (current === undefined) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (current.ownerId !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const parsed = await parseJsonRequest(req, UpdateInstanceSchema);
      if (parsed.kind === "error") {
        return parsed.response;
      }

      if (parsed.data.kind === "static") {
        const limitCheck = ensureStaticResponseWithinLimit(parsed.data.raw);
        if (limitCheck.kind === "error") {
          return limitCheck.response;
        }
      }

      if (parsed.data.kind !== current.kind) {
        return Response.json({ error: "Kind mismatch" }, { status: 400 });
      }

      let nextWebhookIds: string[] | undefined;
      if (parsed.data.webhookIds !== undefined) {
        const validation = await ensureOwnedWebhookIds(
          user.id,
          parsed.data.webhookIds,
        );
        if (validation.kind === "error") {
          return validation.response;
        }
        nextWebhookIds = validation.ids;
      }

      const updated = await updateInstance(id, (inst) => {
        if (inst.kind === "static" && parsed.data.kind === "static") {
          return {
            ...inst,
            raw: parsed.data.raw,
            webhookIds: nextWebhookIds ?? inst.webhookIds,
          };
        }
        if (inst.kind === "dynamic" && parsed.data.kind === "dynamic") {
          return {
            ...inst,
            processors: parsed.data.processors,
            webhookIds: nextWebhookIds ?? inst.webhookIds,
          };
        }
        return inst;
      });

      if (updated === undefined) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }

      return Response.json(updated, { status: 200 });
    }),
    DELETE: withAuth(async (req: BunRequest<"/api/instances/:id">, user) => {
      const id = req.params.id;
      if (id === "") {
        return Response.json({ error: "Invalid id" }, { status: 400 });
      }

      const current = await getInstanceById(id);
      if (current === undefined) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (current.ownerId !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      await deleteInstance(id);
      return Response.json({ message: "Deleted" }, { status: 200 });
    }),
  },
  "/api/instances/:id/extend": {
    POST: withAuth(
      async (req: BunRequest<"/api/instances/:id/extend">, user) => {
        if (instancePolicies.ttlMs === undefined) {
          return Response.json(
            { error: "Instance expiration is disabled" },
            { status: 400 },
          );
        }

        const id = req.params.id;
        if (id === "") {
          return Response.json({ error: "Invalid id" }, { status: 400 });
        }

        const current = await getInstanceById(id);
        if (current === undefined) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (current.ownerId !== user.id) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        if (current.ownerId === GUEST_OWNER_ID) {
          return Response.json(
            { error: "Guest instances cannot be extended" },
            { status: 403 },
          );
        }

        const nextExpiration = Date.now() + instancePolicies.ttlMs;
        const extended = await updateInstance(id, (inst) => ({
          ...inst,
          expiresAt: nextExpiration,
        }));

        if (extended === undefined) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        return Response.json(extended, { status: 200 });
      },
    ),
  },
  "/api/instances/:id/logs": {
    DELETE: withAuth(
      async (req: BunRequest<"/api/instances/:id/logs">, user) => {
        const id = req.params.id;
        if (id === "") {
          return Response.json({ error: "Invalid id" }, { status: 400 });
        }

        const current = await getInstanceById(id);
        if (current === undefined) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (current.ownerId !== user.id) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        await clearLogsForInstance(id);
        return Response.json({ message: "Logs cleared" }, { status: 200 });
      },
    ),
  },
  "/api/instances/:id/rename": {
    PATCH: withAuth(
      async (req: BunRequest<"/api/instances/:id/rename">, user) => {
        const id = req.params.id;
        if (id === "") {
          return Response.json({ error: "Invalid id" }, { status: 400 });
        }

        const current = await getInstanceById(id);
        if (current === undefined) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (current.ownerId !== user.id) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const parsed = await parseJsonRequest(req, RenameInstanceSchema);
        if (parsed.kind === "error") {
          return parsed.response;
        }

        const updated = await updateInstance(id, (inst) => ({
          ...inst,
          label: parsed.data.label,
        }));

        if (updated === undefined) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        return Response.json(updated, { status: 200 });
      },
    ),
  },
} as const;
