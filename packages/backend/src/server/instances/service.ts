import {
  GUEST_INSTANCE_RAW_LIMIT_BYTES,
  GUEST_INSTANCE_TTL_MS,
  GUEST_MAX_ACTIVE_INSTANCES,
  GUEST_OWNER_ID,
  MAX_INSTANCE_ROUTES,
  routeKey,
  type Instance,
  type InstanceRoute,
} from "shared";
import { dnsConfig, instancePolicies } from "../../config";
import {
  addInstance,
  addGuestInstance,
  countActiveInstancesByOwner,
  getInstanceById,
  getWebhooksByOwner,
  updateInstance,
} from "../../storage";
import { issueGuestManagementToken } from "../guestAccess";
import { generateInstanceID, validateStaticRaw } from "../utils";

type InstanceServiceErrorCode =
  | "invalid_raw"
  | "invalid_routes"
  | "invalid_webhooks"
  | "instance_limit"
  | "not_found"
  | "forbidden";

export type InstanceServiceError = {
  code: InstanceServiceErrorCode;
  message: string;
  status: number;
};

export type InstanceServiceResult<T> =
  { ok: true; value: T } | { ok: false; error: InstanceServiceError };

const fail = (
  code: InstanceServiceErrorCode,
  message: string,
  status: number,
): InstanceServiceResult<never> => ({
  ok: false,
  error: { code, message, status },
});

const validateWebhookIds = (
  ownerId: string,
  webhookIds: string[],
): InstanceServiceResult<string[]> => {
  if (webhookIds.length === 0) {
    return { ok: true, value: [] };
  }

  if (new Set(webhookIds).size !== webhookIds.length) {
    return fail("invalid_webhooks", "Invalid webhook selection", 400);
  }

  const ownedIds = new Set(
    getWebhooksByOwner(ownerId).map((webhook) => webhook.id),
  );
  if (webhookIds.some((webhookId) => !ownedIds.has(webhookId))) {
    return fail("invalid_webhooks", "Invalid webhook selection", 400);
  }
  return { ok: true, value: webhookIds };
};

const validateRaw = (raw: string): InstanceServiceResult<string> => {
  const result = validateStaticRaw(raw);
  return result.ok
    ? { ok: true, value: result.raw }
    : fail("invalid_raw", result.error, result.status);
};

const rawEncoder = new TextEncoder();

const validateRoutes = (
  raw: string,
  routes: readonly InstanceRoute[],
): InstanceServiceResult<InstanceRoute[]> => {
  if (routes.length > MAX_INSTANCE_ROUTES) {
    return fail(
      "invalid_routes",
      `An instance can have at most ${MAX_INSTANCE_ROUTES} path responses`,
      400,
    );
  }
  const keys = new Set<string>();
  const normalized: InstanceRoute[] = [];
  let totalBytes = rawEncoder.encode(raw).length;
  for (const route of routes) {
    const key = routeKey(route);
    if (keys.has(key)) {
      return fail(
        "invalid_routes",
        `Duplicate path response for ${key.replace(/^\* /, "")}`,
        400,
      );
    }
    keys.add(key);
    const routeRaw = validateStaticRaw(route.raw);
    if (!routeRaw.ok) {
      return fail(
        "invalid_raw",
        `${route.path}: ${routeRaw.error}`,
        routeRaw.status,
      );
    }
    totalBytes += rawEncoder.encode(routeRaw.raw).length;
    normalized.push({
      ...(route.method === undefined ? {} : { method: route.method }),
      path: route.path,
      raw: routeRaw.raw,
    });
  }
  if (totalBytes > instancePolicies.rawLimitBytes) {
    return fail(
      "invalid_raw",
      `Responses exceed the ${instancePolicies.rawLimitBytes / (1024 * 1024)}MB instance limit`,
      413,
    );
  }
  return { ok: true, value: normalized };
};

const validateGuestRaw = (raw: string): InstanceServiceResult<string> => {
  if (rawEncoder.encode(raw).length > GUEST_INSTANCE_RAW_LIMIT_BYTES) {
    return fail("invalid_raw", "Guest response exceeds 1MB limit", 413);
  }
  return validateRaw(raw);
};

export const getOwnedInstance = (
  instanceId: string,
  ownerId: string,
): InstanceServiceResult<Instance> => {
  const instance = getInstanceById(instanceId);
  if (instance === undefined) {
    return fail("not_found", "Not found", 404);
  }
  if (instance.ownerId !== ownerId) {
    return fail("forbidden", "Forbidden", 403);
  }
  return { ok: true, value: instance };
};

type CreateInstanceInput = {
  ownerId: string;
  raw: string;
  routes?: InstanceRoute[];
  webhookIds?: string[];
  label?: string;
  ttlMs?: number;
  createdByApiKeyId?: string;
};

const instanceLimitMessage = (limit: number) =>
  `Instance limit reached (${limit} active). Reuse an existing instance instead: tell probes apart with <token>.<id>.${dnsConfig.instancesDomain} hostnames or URL paths, serve different responses per path, and delete unused instances.`;

export const createInstance = (
  input: CreateInstanceInput,
): InstanceServiceResult<Instance> => {
  const raw = validateRaw(input.raw);
  if (!raw.ok) {
    return raw;
  }

  const routes = validateRoutes(raw.value, input.routes ?? []);
  if (!routes.ok) {
    return routes;
  }

  const webhookIds = validateWebhookIds(input.ownerId, input.webhookIds ?? []);
  if (!webhookIds.ok) {
    return webhookIds;
  }

  const limit = instancePolicies.maxInstancesPerOwner;
  if (
    limit !== undefined &&
    countActiveInstancesByOwner(input.ownerId) >= limit
  ) {
    return fail("instance_limit", instanceLimitMessage(limit), 403);
  }

  const now = Date.now();
  const ttlMs = input.ttlMs ?? instancePolicies.defaultTtlMs;
  const expiresAt = ttlMs === undefined ? undefined : now + ttlMs;

  return {
    ok: true,
    value: addInstance({
      id: generateInstanceID(),
      ownerId: input.ownerId,
      createdAt: now,
      expiresAt,
      webhookIds: webhookIds.value,
      label: input.label,
      public: false,
      locked: false,
      raw: raw.value,
      routes: routes.value,
      createdByApiKeyId: input.createdByApiKeyId,
    }),
  };
};

type UpdateInstanceInput = {
  instanceId: string;
  ownerId: string;
  raw?: string;
  routes?: InstanceRoute[];
  webhookIds?: string[];
};

export const replaceInstance = (
  input: UpdateInstanceInput,
): InstanceServiceResult<Instance> => {
  const owned = getOwnedInstance(input.instanceId, input.ownerId);
  if (!owned.ok) {
    return owned;
  }

  const raw = validateRaw(input.raw ?? owned.value.raw);
  if (!raw.ok) {
    return raw;
  }

  const routes = validateRoutes(raw.value, input.routes ?? owned.value.routes);
  if (!routes.ok) {
    return routes;
  }

  const webhookIds =
    input.webhookIds === undefined
      ? ({ ok: true, value: owned.value.webhookIds } as const)
      : validateWebhookIds(input.ownerId, input.webhookIds);
  if (!webhookIds.ok) {
    return webhookIds;
  }

  const updated = updateInstance(input.instanceId, (instance) => ({
    ...instance,
    raw: raw.value,
    routes: routes.value,
    webhookIds: webhookIds.value,
  }));

  return updated === undefined
    ? fail("not_found", "Not found", 404)
    : { ok: true, value: updated };
};

export const setInstanceRoute = (input: {
  instanceId: string;
  ownerId: string;
  route: InstanceRoute;
}): InstanceServiceResult<Instance> => {
  const owned = getOwnedInstance(input.instanceId, input.ownerId);
  if (!owned.ok) {
    return owned;
  }
  const key = routeKey(input.route);
  const exists = owned.value.routes.some((route) => routeKey(route) === key);
  const routes = exists
    ? owned.value.routes.map((route) =>
        routeKey(route) === key ? input.route : route,
      )
    : [...owned.value.routes, input.route];
  return replaceInstance({
    instanceId: input.instanceId,
    ownerId: input.ownerId,
    routes,
  });
};

export const deleteInstanceRoute = (input: {
  instanceId: string;
  ownerId: string;
  route: Pick<InstanceRoute, "method" | "path">;
}): InstanceServiceResult<Instance> => {
  const owned = getOwnedInstance(input.instanceId, input.ownerId);
  if (!owned.ok) {
    return owned;
  }
  const key = routeKey(input.route);
  const routes = owned.value.routes.filter((route) => routeKey(route) !== key);
  if (routes.length === owned.value.routes.length) {
    return fail(
      "not_found",
      `No path response for ${key.replace(/^\* /, "")}`,
      404,
    );
  }
  return replaceInstance({
    instanceId: input.instanceId,
    ownerId: input.ownerId,
    routes,
  });
};

const extendedExpiration = (
  expiresAt: number | undefined,
  ttlMs: number,
): number | undefined => {
  if (expiresAt === undefined) {
    return undefined;
  }
  return Math.max(
    expiresAt,
    Date.now() + Math.min(ttlMs, instancePolicies.maxTtlMs),
  );
};

export const extendInstance = (input: {
  instanceId: string;
  ownerId: string;
  ttlMs?: number;
}): InstanceServiceResult<Instance> => {
  const owned = getOwnedInstance(input.instanceId, input.ownerId);
  if (!owned.ok) {
    return owned;
  }
  const updated = updateInstance(input.instanceId, (instance) => ({
    ...instance,
    expiresAt: extendedExpiration(
      instance.expiresAt,
      input.ttlMs ?? instancePolicies.maxTtlMs,
    ),
  }));
  return updated === undefined
    ? fail("not_found", "Not found", 404)
    : { ok: true, value: updated };
};

export const setInstanceLocked = (input: {
  instanceId: string;
  ownerId: string;
  locked: boolean;
}): InstanceServiceResult<Instance> => {
  const owned = getOwnedInstance(input.instanceId, input.ownerId);
  if (!owned.ok) {
    return owned;
  }
  const updated = updateInstance(input.instanceId, (instance) => ({
    ...instance,
    locked: input.locked,
    expiresAt: input.locked
      ? extendedExpiration(instance.expiresAt, instancePolicies.maxTtlMs)
      : instance.expiresAt,
  }));
  return updated === undefined
    ? fail("not_found", "Not found", 404)
    : { ok: true, value: updated };
};

export const createGuestInstance = async (
  raw: string,
): Promise<InstanceServiceResult<{ instance: Instance; token: string }>> => {
  const validatedRaw = validateGuestRaw(raw);
  if (!validatedRaw.ok) {
    return validatedRaw;
  }
  if (
    countActiveInstancesByOwner(GUEST_OWNER_ID) >= GUEST_MAX_ACTIVE_INSTANCES
  ) {
    return fail("instance_limit", "Guest instance limit reached", 503);
  }

  const now = Date.now();
  const expiresAt = now + GUEST_INSTANCE_TTL_MS;
  const instanceId = generateInstanceID();
  const token = await issueGuestManagementToken(
    { id: instanceId, createdAt: now },
    expiresAt,
  );
  const instance = addGuestInstance({
    id: instanceId,
    ownerId: GUEST_OWNER_ID,
    createdAt: now,
    expiresAt,
    webhookIds: [],
    public: false,
    locked: false,
    raw: validatedRaw.value,
  });
  return {
    ok: true,
    value: { instance, token },
  };
};

export const replaceGuestInstance = (
  instanceId: string,
  raw: string,
): InstanceServiceResult<Instance> => {
  const owned = getOwnedInstance(instanceId, GUEST_OWNER_ID);
  if (!owned.ok) {
    return owned;
  }
  const validatedRaw = validateGuestRaw(raw);
  if (!validatedRaw.ok) {
    return validatedRaw;
  }
  const updated = updateInstance(instanceId, (instance) => ({
    ...instance,
    raw: validatedRaw.value,
    webhookIds: [],
  }));
  return updated === undefined
    ? fail("not_found", "Not found", 404)
    : { ok: true, value: updated };
};
