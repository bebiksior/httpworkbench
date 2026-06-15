import { Elysia, status } from "elysia";
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
import { generateInstanceID, validateStaticRaw } from "../utils";

const loadGuestInstance = (id: string) => {
  const instance = getInstanceById(id);
  if (instance?.ownerId !== GUEST_OWNER_ID) {
    return { ok: false as const, error: status(404, { error: "Not found" }) };
  }
  return { ok: true as const, instance };
};

export const guestInstancesRoutes = new Elysia({ name: "routes/guest" })
  .guard({ detail: { hide: true } })
  .onBeforeHandle(() => {
    if (!instancePolicies.allowGuest) {
      return status(403, { error: "Guest access is disabled" });
    }
  })
  .post(
    "/api/guest/instances",
    ({ body }) => {
      let staticRaw: string | undefined;
      if (body.kind === "static") {
        const check = validateStaticRaw(body.raw);
        if (!check.ok) {
          return status(check.status, { error: check.error });
        }
        staticRaw = check.raw;
      }

      const now = Date.now();
      const base = {
        id: generateInstanceID(),
        ownerId: GUEST_OWNER_ID,
        createdAt: now,
        expiresAt: now + GUEST_INSTANCE_TTL_MS,
        webhookIds: [] as string[],
        public: false,
        locked: false,
      };

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
    { body: CreateInstanceSchema },
  )
  .get("/api/guest/instances/:id", ({ params }) => {
    const loaded = loadGuestInstance(params.id);
    if (!loaded.ok) {
      return loaded.error;
    }
    const logs = getLogsForInstance(loaded.instance.id);
    return InstanceDetailResponseSchema.parse({
      instance: loaded.instance,
      logs,
    });
  })
  .put(
    "/api/guest/instances/:id",
    ({ params, body }) => {
      const loaded = loadGuestInstance(params.id);
      if (!loaded.ok) {
        return loaded.error;
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

      const updated = updateInstance(loaded.instance.id, (inst) => {
        if (inst.kind === "static" && body.kind === "static") {
          return { ...inst, raw: staticRaw ?? body.raw, webhookIds: [] };
        }
        if (inst.kind === "dynamic" && body.kind === "dynamic") {
          return { ...inst, processors: body.processors, webhookIds: [] };
        }
        return inst;
      });
      if (updated === undefined) {
        return status(404, { error: "Not found" });
      }
      return updated;
    },
    { body: UpdateInstanceSchema },
  )
  .delete("/api/guest/instances/:id", ({ params }) => {
    const loaded = loadGuestInstance(params.id);
    if (!loaded.ok) {
      return loaded.error;
    }
    if (loaded.instance.locked) {
      return status(409, { error: "Instance is locked" });
    }
    deleteInstance(loaded.instance.id);
    return { message: "Deleted" };
  })
  .patch(
    "/api/guest/instances/:id/lock",
    ({ params, body }) => {
      const loaded = loadGuestInstance(params.id);
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
    { body: SetInstanceLockedSchema },
  )
  .delete("/api/guest/instances/:id/logs", ({ params }) => {
    const loaded = loadGuestInstance(params.id);
    if (!loaded.ok) {
      return loaded.error;
    }
    clearLogsForInstance(loaded.instance.id);
    return { message: "Logs cleared" };
  });
