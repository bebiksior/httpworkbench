import type { BunRequest, Server, ServerWebSocket } from "bun";
import { listen, serve } from "bun";
import { parse } from "http-z";
import { GUEST_OWNER_ID, type Log } from "shared";
import { addLog } from "../storage";
import { getInstanceById } from "../storage/repositories/instances";
import { instancePolicies } from "../config";
import { cleanupExpiredInstances } from "../storage/maintenance";
import {
  CONFIG_ROUTES,
  GUEST_INSTANCES_ROUTES,
  INSTANCES_ROUTES,
  OAUTH_ROUTES,
  USER_ROUTES,
  WEBHOOKS_ROUTES,
} from "./api";
import { authenticateRequest } from "./auth";
import {
  broadcastLog,
  type LogStreamSocketData,
  subscribeToLogStream,
  unsubscribeFromLogStream,
} from "./logStream";
import {
  adjustContentLength,
  createResponse,
  getInstanceIDFromHost,
  respond,
} from "./utils";

/**
 * API server is responsible for the API routes
 * INSTANCES server listens on $instanceID.instances.$domain and logs the interactions
 */
export const initServer = () => {
  const apiServer = serve({
    hostname: "0.0.0.0",
    port: parseInt(Bun.env.API_PORT ?? "8081", 10),
    websocket: {
      open: (ws: ServerWebSocket<LogStreamSocketData>) => {
        const instanceId = ws.data?.instanceId;
        if (instanceId === undefined) {
          ws.close(1008, "Missing instance context");
          return;
        }
        subscribeToLogStream(instanceId, ws);
      },
      message: () => {},
      close: (ws: ServerWebSocket<LogStreamSocketData>) => {
        unsubscribeFromLogStream(ws);
      },
    },
    routes: {
      ...CONFIG_ROUTES,
      ...OAUTH_ROUTES,
      ...USER_ROUTES,
      ...INSTANCES_ROUTES,
      ...GUEST_INSTANCES_ROUTES,
      ...WEBHOOKS_ROUTES,
      "/api/instances/:id/stream": {
        GET: async (
          req: BunRequest<"/api/instances/:id/stream">,
          server: Server<LogStreamSocketData>,
        ) => {
          const upgradeHeader = req.headers.get("upgrade");
          if (
            upgradeHeader === null ||
            upgradeHeader.toLowerCase() !== "websocket"
          ) {
            return new Response("Upgrade Required", { status: 426 });
          }

          const auth = await authenticateRequest(req);
          const instance = await getInstanceById(req.params.id);
          if (instance === undefined) {
            if (auth.kind === "error") {
              return new Response("Unauthorized", { status: auth.status });
            }
            return Response.json({ error: "Not found" }, { status: 404 });
          }

          if (instance.ownerId === GUEST_OWNER_ID) {
            const upgraded = server.upgrade(req, {
              data: {
                instanceId: instance.id,
                userId: GUEST_OWNER_ID,
              },
            });

            if (!upgraded) {
              return new Response("Upgrade failed", { status: 500 });
            }
            return;
          }

          if (auth.kind === "error") {
            return new Response("Unauthorized", { status: auth.status });
          }

          if (instance.ownerId !== auth.user.id) {
            return new Response("Forbidden", { status: 403 });
          }

          const upgraded = server.upgrade(req, {
            data: {
              instanceId: instance.id,
              userId: auth.user.id,
            },
          });

          if (!upgraded) {
            return new Response("Upgrade failed", { status: 500 });
          }
        },
      },
      "/api/health": {
        GET: () =>
          new Response(JSON.stringify({ status: "ok" }), {
            headers: { "Content-Type": "application/json" },
          }),
      },
      "/api/version": {
        GET: async () => {
          const { version } = await import("../index");
          return Response.json({ version });
        },
      },
    },
  });
  console.log(`API server running on port ${Bun.env.API_PORT}`);

  const instancesServer = listen({
    hostname: "0.0.0.0",
    port: parseInt(Bun.env.INSTANCES_PORT ?? "8082", 10),
    socket: {
      async data(socket, data) {
        try {
          const dataString = new TextDecoder().decode(data);
          const request = parse(dataString);

          const host = request.headers.find(
            (header) => header.name === "Host",
          )?.value;

          if (host === undefined || host === "") {
            respond(
              socket,
              createResponse("400 Bad Request", "Missing Host header"),
            );
            return;
          }

          const result = getInstanceIDFromHost(host);
          if (result.kind === "error") {
            respond(socket, createResponse("400 Bad Request", result.error));
            return;
          }

          const instance = await getInstanceById(result.instanceId);
          if (!instance) {
            respond(
              socket,
              createResponse("400 Bad Request", "Instance not found"),
            );
            return;
          }

          const realIpHeader = request.headers.find(
            (header) => header.name.toLowerCase() === "x-real-ip",
          )?.value;
          const clientAddress = realIpHeader ?? socket.remoteAddress;

          const log = {
            id: crypto.randomUUID(),
            instanceId: instance.id,
            type: "http",
            timestamp: Date.now(),
            address: clientAddress,
            raw: dataString,
          } satisfies Log;

          await addLog(log);
          broadcastLog(log);

          switch (instance.kind) {
            case "static": {
              const adjustedResponse = adjustContentLength(instance.raw);
              respond(socket, new TextEncoder().encode(adjustedResponse));
              break;
            }
            case "dynamic":
              throw new Error("Dynamic instances are not supported yet");
          }
        } catch (error) {
          console.error(error);
          respond(
            socket,
            createResponse("500 Internal Server Error", "Something went wrong"),
          );
          return;
        }
      },
    },
  });
  console.log(`Instances server running on port ${Bun.env.INSTANCES_PORT}`);

  let cleanupInterval: ReturnType<typeof setInterval> | undefined;
  const ttlMs = instancePolicies.ttlMs;
  if (ttlMs !== undefined) {
    const intervalMs = Math.min(ttlMs, 60 * 60 * 1000);
    const runCleanup = () => {
      cleanupExpiredInstances().catch((error) => {
        console.error("Failed to cleanup expired instances", error);
      });
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

  return { apiServer, instancesServer, stopMaintenance };
};
