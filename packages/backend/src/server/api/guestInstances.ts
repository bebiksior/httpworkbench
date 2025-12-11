import type { BunRequest } from "bun";
import {
  CreateInstanceSchema,
  GUEST_INSTANCE_TTL_MS,
  GUEST_OWNER_ID,
  InstanceDetailResponseSchema,
  SetInstanceLockedSchema,
  UpdateInstanceSchema,
} from "shared";
import { instancePolicies } from "../../config";
import {
  addInstance,
  clearLogsForInstance,
  deleteInstance,
  getInstanceById,
  getLogsForInstance,
  updateInstance,
} from "../../storage";
import {
  ensureStaticResponseWithinLimit,
  generateInstanceID,
  parseJsonRequest,
} from "../utils";

const guestDisabledResponse = () =>
  Response.json({ error: "Guest access is disabled" }, { status: 403 });

const loadGuestInstance = async (id: string) => {
  if (id === "") {
    return {
      kind: "error" as const,
      response: Response.json({ error: "Invalid id" }, { status: 400 }),
    };
  }

  const instance = await getInstanceById(id);
  if (instance?.ownerId !== GUEST_OWNER_ID) {
    return {
      kind: "error" as const,
      response: Response.json({ error: "Not found" }, { status: 404 }),
    };
  }

  return { kind: "ok" as const, instance };
};

export const GUEST_INSTANCES_ROUTES = {
  "/api/guest/instances": {
    POST: async (req: BunRequest<"/api/guest/instances">) => {
      if (!instancePolicies.allowGuest) {
        return guestDisabledResponse();
      }

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

      const now = Date.now();
      const base = {
        id: generateInstanceID(),
        ownerId: GUEST_OWNER_ID,
        createdAt: now,
        expiresAt: now + GUEST_INSTANCE_TTL_MS,
        webhookIds: [] as string[],
        locked: false,
      };

      switch (parsed.data.kind) {
        case "static": {
          const created = await addInstance({
            kind: "static",
            ...base,
            raw: parsed.data.raw,
          });
          return Response.json(created, { status: 201 });
        }
        case "dynamic": {
          const created = await addInstance({
            kind: "dynamic",
            ...base,
            processors: parsed.data.processors,
          });
          return Response.json(created, { status: 201 });
        }
      }
    },
  },
  "/api/guest/instances/:id": {
    GET: async (req: BunRequest<"/api/guest/instances/:id">) => {
      if (!instancePolicies.allowGuest) {
        return guestDisabledResponse();
      }

      const loaded = await loadGuestInstance(req.params.id);
      if (loaded.kind === "error") {
        return loaded.response;
      }
      const logs = await getLogsForInstance(loaded.instance.id);
      const response = InstanceDetailResponseSchema.parse({
        instance: loaded.instance,
        logs,
      });
      return Response.json(response, { status: 200 });
    },
    PUT: async (req: BunRequest<"/api/guest/instances/:id">) => {
      if (!instancePolicies.allowGuest) {
        return guestDisabledResponse();
      }

      const loaded = await loadGuestInstance(req.params.id);
      if (loaded.kind === "error") {
        return loaded.response;
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

      if (parsed.data.kind !== loaded.instance.kind) {
        return Response.json({ error: "Kind mismatch" }, { status: 400 });
      }

      const updated = await updateInstance(loaded.instance.id, (inst) => {
        if (inst.kind === "static" && parsed.data.kind === "static") {
          return {
            ...inst,
            raw: parsed.data.raw,
            webhookIds: [],
          };
        }
        if (inst.kind === "dynamic" && parsed.data.kind === "dynamic") {
          return {
            ...inst,
            processors: parsed.data.processors,
            webhookIds: [],
          };
        }
        return inst;
      });

      if (updated === undefined) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }

      return Response.json(updated, { status: 200 });
    },
    DELETE: async (req: BunRequest<"/api/guest/instances/:id">) => {
      if (!instancePolicies.allowGuest) {
        return guestDisabledResponse();
      }

      const loaded = await loadGuestInstance(req.params.id);
      if (loaded.kind === "error") {
        return loaded.response;
      }
      if (loaded.instance.locked) {
        return Response.json({ error: "Instance is locked" }, { status: 409 });
      }
      await deleteInstance(loaded.instance.id);
      return Response.json({ message: "Deleted" }, { status: 200 });
    },
  },
  "/api/guest/instances/:id/lock": {
    PATCH: async (req: BunRequest<"/api/guest/instances/:id/lock">) => {
      if (!instancePolicies.allowGuest) {
        return guestDisabledResponse();
      }

      const loaded = await loadGuestInstance(req.params.id);
      if (loaded.kind === "error") {
        return loaded.response;
      }

      const parsed = await parseJsonRequest(req, SetInstanceLockedSchema);
      if (parsed.kind === "error") {
        return parsed.response;
      }

      const updated = await updateInstance(loaded.instance.id, (inst) => ({
        ...inst,
        locked: parsed.data.locked,
      }));

      if (updated === undefined) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }

      return Response.json(updated, { status: 200 });
    },
  },
  "/api/guest/instances/:id/logs": {
    DELETE: async (req: BunRequest<"/api/guest/instances/:id/logs">) => {
      if (!instancePolicies.allowGuest) {
        return guestDisabledResponse();
      }

      const loaded = await loadGuestInstance(req.params.id);
      if (loaded.kind === "error") {
        return loaded.response;
      }
      await clearLogsForInstance(loaded.instance.id);
      return Response.json({ message: "Logs cleared" }, { status: 200 });
    },
  },
} as const;
