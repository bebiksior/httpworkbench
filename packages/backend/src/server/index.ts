import { Elysia, status } from "elysia";
import {
  GUEST_INSTANCE_TTL_MS,
  GUEST_OWNER_ID,
  INSTANCE_RAW_LIMIT_BYTES,
} from "shared";
import {
  addLogWithOutcome,
  flushPendingWebhookNotifications,
  getInstanceAccessMetadata,
  hasActiveInstance,
  removeExpiredInstances,
} from "../storage";
import { dnsConfig, instancePolicies, smtpConfig } from "../config";
import {
  apiKeysRoutes,
  guestInstancesRoutes,
  instancesRoutes,
  oauthRoutes,
  userRoutes,
  webhooksRoutes,
} from "./api";
import {
  apiKeyMissingScope,
  enforceApiKeyRateLimit,
  readSessionCookie,
  resolveOptionalAccess,
} from "./auth";
import { closeMcpHandler, handleMcpRequest } from "./mcp";
import { openApiPlugin } from "./openapi";
import { canReadInstance } from "./instances/access";
import {
  authenticateGuestInstance,
  readGuestWebSocketProtocol,
} from "./guestAccess";
import {
  broadcastLog,
  createInstancesServer,
  subscribeToLogStream,
  unsubscribeFromLogStream,
} from "./instances";
import { createDnsServer } from "./dns";
import { createSmtpServer } from "./smtp";
import { createBoundedProtocolRateLimiter } from "./protocolRateLimit";
import { isAllowedWebSocketOrigin } from "./webSocketOrigin";
import { version } from "../version";

const guestStreamRateLimiter = createBoundedProtocolRateLimiter({
  maxRequests: 60,
  windowMs: 60_000,
  maxEntries: 10_000,
});

// JSON.stringify can expand one string character to a six-byte escape. Leave
// additional room for the request envelope and bounded companion fields.
const maxRequestBodySize = INSTANCE_RAW_LIMIT_BYTES * 6 + 1024 * 1024;

export const buildApiServer = (port: number) => {
  return new Elysia()
    .onError({ as: "global" }, ({ code, error, set }) => {
      if (code === "VALIDATION") {
        set.status = 400;
        const where = (error as { type?: string }).type ?? "body";
        return { error: `Invalid ${where}` };
      }
      if (code === "PARSE") {
        set.status = 400;
        return { error: "Invalid JSON" };
      }
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { error: "Not found" };
      }
      console.error(error);
      set.status = 500;
      return { error: "Internal server error" };
    })
    .onRequest(({ request }) => {
      if (new URL(request.url).pathname === "/mcp") {
        return handleMcpRequest(request);
      }
    })
    .use(openApiPlugin())
    .get("/api/health", () => ({ status: "ok" }), { detail: { hide: true } })
    .get("/api/version", () => ({ version }), { detail: { hide: true } })
    .use(oauthRoutes)
    .use(userRoutes)
    .use(instancesRoutes)
    .use(guestInstancesRoutes)
    .use(webhooksRoutes)
    .use(apiKeysRoutes)
    .ws("/api/instances/:id/stream", {
      async beforeHandle({ params, request, set, cookie }) {
        if (!isAllowedWebSocketOrigin(request)) {
          return status(403, { error: "Invalid origin" });
        }
        const instance = getInstanceAccessMetadata(params.id);
        if (instance === undefined) {
          return status(404, { error: "Not found" });
        }
        if (instance.ownerId === GUEST_OWNER_ID) {
          const clientKey =
            request.headers.get("x-internal-real-ip") ?? "unknown";
          if (!guestStreamRateLimiter.check(clientKey, Date.now())) {
            return status(429, { error: "Guest stream rate limit exceeded" });
          }
          const guestProtocol = readGuestWebSocketProtocol(request);
          if (
            guestProtocol === undefined ||
            !authenticateGuestInstance(params.id, guestProtocol.token)
          ) {
            return status(404, { error: "Not found" });
          }
          set.headers["Sec-WebSocket-Protocol"] = guestProtocol.protocol;
          return;
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
        if (!publiclyReadable && apiKeyMissingScope(access, "logs:stream")) {
          set.headers["WWW-Authenticate"] =
            'Bearer error="insufficient_scope", scope="logs:stream"';
          return status(403, {
            error: "Missing required scope: logs:stream",
          });
        }
      },
      open(ws) {
        subscribeToLogStream(ws.data.params.id, ws.raw);
      },
      message(ws, message) {
        if (message === "ping") {
          ws.send("pong");
        }
      },
      close(ws) {
        unsubscribeFromLogStream(ws.data.params.id, ws.raw);
      },
    })
    .listen({ port, maxRequestBodySize }, () => {
      console.log(`API server running on port ${port}`);
    });
};

export const initServer = async () => {
  const apiServer = buildApiServer(parseInt(Bun.env.API_PORT ?? "8081", 10));

  const instancesServer = createInstancesServer(
    parseInt(Bun.env.INSTANCES_PORT ?? "8082", 10),
  );
  const dnsServer = dnsConfig.dnsEnabled
    ? await createDnsServer({
        config: dnsConfig,
        deps: {
          hasActiveInstance: async (id) => hasActiveInstance(id),
          addLog: addLogWithOutcome,
          broadcastLog,
          createId: () => crypto.randomUUID(),
          now: () => Date.now(),
        },
      })
    : undefined;

  const smtpServer = smtpConfig.smtpEnabled
    ? await createSmtpServer({
        config: smtpConfig,
        deps: {
          hasActiveInstance: async (id) => hasActiveInstance(id),
          addLog: addLogWithOutcome,
          broadcastLog,
          createId: () => crypto.randomUUID(),
          now: () => Date.now(),
        },
      })
    : undefined;

  let cleanupInterval: ReturnType<typeof setInterval> | undefined;
  const defaultTtlMs = instancePolicies.defaultTtlMs;
  if (defaultTtlMs !== undefined || instancePolicies.allowGuest) {
    const shortestTtlMs = Math.min(
      defaultTtlMs ?? Number.POSITIVE_INFINITY,
      instancePolicies.allowGuest
        ? GUEST_INSTANCE_TTL_MS
        : Number.POSITIVE_INFINITY,
    );
    const intervalMs = Math.min(shortestTtlMs, 60 * 60 * 1000);
    const runCleanup = () => {
      try {
        removeExpiredInstances(Date.now());
      } catch (error) {
        console.error("Failed to cleanup expired instances", error);
      }
    };
    runCleanup();
    cleanupInterval = setInterval(runCleanup, intervalMs);
  }

  const stopMaintenance = () => {
    if (cleanupInterval !== undefined) {
      clearInterval(cleanupInterval);
      cleanupInterval = undefined;
    }
  };

  const drainBackgroundWork = async () => {
    await closeMcpHandler();
    await flushPendingWebhookNotifications();
  };

  return {
    apiServer,
    instancesServer,
    dnsServer,
    smtpServer,
    stopMaintenance,
    drainBackgroundWork,
  };
};
