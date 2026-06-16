import { Elysia, status } from "elysia";
import {
  addLog,
  flushPendingWebhookNotifications,
  getInstanceById,
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
import { handleMcpRequest } from "./mcp";
import { openApiPlugin } from "./openapi";
import { canReadInstance } from "./instances/access";
import {
  broadcastLog,
  createInstancesServer,
  subscribeToLogStream,
  unsubscribeFromLogStream,
} from "./instances";
import { createDnsServer } from "./dns";
import { createSmtpServer } from "./smtp";
import { version } from "../version";

const buildApiServer = (port: number) => {
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
    .listen(port, () => {
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
          getInstanceById: async (id) => getInstanceById(id),
          addLog: async (log) => addLog(log),
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
          getInstanceById: async (id) => getInstanceById(id),
          addLog: async (log) => addLog(log),
          broadcastLog,
          createId: () => crypto.randomUUID(),
          now: () => Date.now(),
        },
      })
    : undefined;

  let cleanupInterval: ReturnType<typeof setInterval> | undefined;
  const defaultTtlMs = instancePolicies.defaultTtlMs;
  if (defaultTtlMs !== undefined) {
    const intervalMs = Math.min(defaultTtlMs, 60 * 60 * 1000);
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
