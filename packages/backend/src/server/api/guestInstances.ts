import { Elysia, status } from "elysia";
import {
  CreateInstanceSchema,
  GuestInstanceSummariesRequestSchema,
  GUEST_OWNER_ID,
  InstanceDetailResponseSchema,
  SetInstanceLockedSchema,
  UpdateInstanceSchema,
} from "shared";
import { instancePolicies } from "../../config";
import {
  clearLogsForInstance,
  deleteInstance,
  getInstanceById,
  getInstanceSummariesByIds,
  getRecentLogsForInstance,
  updateInstance,
} from "../../storage";
import {
  createGuestInstance,
  replaceGuestInstance,
} from "../instances/service";

const INSTANCE_DETAIL_LOG_LIMIT = 100;

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
      const result = createGuestInstance(body.raw);
      return result.ok
        ? status(201, result.value)
        : status(result.error.status, { error: result.error.message });
    },
    { body: CreateInstanceSchema },
  )
  .post(
    "/api/guest/instances/list",
    ({ body }) =>
      getInstanceSummariesByIds([...new Set(body.ids)], GUEST_OWNER_ID),
    { body: GuestInstanceSummariesRequestSchema },
  )
  .get("/api/guest/instances/:id", ({ params }) => {
    const loaded = loadGuestInstance(params.id);
    if (!loaded.ok) {
      return loaded.error;
    }
    const logs = getRecentLogsForInstance(
      loaded.instance.id,
      INSTANCE_DETAIL_LOG_LIMIT,
    );
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
      const result = replaceGuestInstance(loaded.instance.id, body.raw);
      return result.ok
        ? result.value
        : status(result.error.status, { error: result.error.message });
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
