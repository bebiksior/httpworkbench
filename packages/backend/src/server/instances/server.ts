import { listen, type Socket } from "bun";
import {
  findInstanceRoute,
  parseRequestTarget,
  routeKey,
  type Log,
} from "shared";
import { addLogWithOutcome } from "../../storage";
import {
  getServableInstanceById,
  type ServableInstance,
} from "../../storage/repositories/instances";
import { broadcastLog } from "./logStream";
import { HttpRequestBuffer } from "./httpBuffer";
import {
  adjustContentLength,
  createResponse,
  getHeaderValue,
  getInstanceIDFromHost,
  respond,
  stripInternalHeaders,
} from "./utils";

type SocketData = {
  buffer: HttpRequestBuffer;
};

const INTERNAL_HEADER_NAMES = ["x-internal-real-ip"];
const responseEncoder = new TextEncoder();
const maxCachedResponseBytes = 64 * 1024 * 1024;

type CachedResponse = {
  raw: string;
  encoded: Uint8Array;
  size: number;
};

const responseCache = new Map<string, CachedResponse>();
let cachedResponseBytes = 0;

export const resetInstanceResponseCacheForTests = () => {
  responseCache.clear();
  cachedResponseBytes = 0;
};

const selectInstanceResponse = (
  instance: ServableInstance,
  rawRequest: string,
): { cacheKey: string; raw: string } => {
  const target = parseRequestTarget(rawRequest);
  const route =
    target === undefined
      ? undefined
      : findInstanceRoute(instance.routes, target.method, target.path);
  return route === undefined
    ? { cacheKey: instance.id, raw: instance.raw }
    : { cacheKey: `${instance.id} ${routeKey(route)}`, raw: route.raw };
};

const encodeInstanceResponse = (response: {
  cacheKey: string;
  raw: string;
}) => {
  const { cacheKey, raw } = response;
  const cached = responseCache.get(cacheKey);
  if (cached?.raw === raw) {
    responseCache.delete(cacheKey);
    responseCache.set(cacheKey, cached);
    return cached.encoded;
  }

  if (cached !== undefined) {
    responseCache.delete(cacheKey);
    cachedResponseBytes -= cached.size;
  }

  const encoded = responseEncoder.encode(adjustContentLength(raw));
  const size = encoded.byteLength + raw.length * 2;
  if (size > maxCachedResponseBytes) {
    return encoded;
  }

  while (cachedResponseBytes + size > maxCachedResponseBytes) {
    const oldestId = responseCache.keys().next().value;
    if (oldestId === undefined) {
      break;
    }
    const oldest = responseCache.get(oldestId);
    responseCache.delete(oldestId);
    cachedResponseBytes -= oldest?.size ?? 0;
  }

  responseCache.set(cacheKey, { raw, encoded, size });
  cachedResponseBytes += size;
  return encoded;
};

const createHttpLog = (
  instanceId: string,
  address: string,
  rawRequest: string,
) => {
  return {
    id: crypto.randomUUID(),
    instanceId,
    type: "http",
    timestamp: Date.now(),
    address,
    raw: rawRequest,
  } satisfies Log;
};

const tryLogInteraction = <T>(
  socket: Socket<T>,
  rawRequest: string,
): boolean => {
  try {
    const host = getHeaderValue(rawRequest, "host");
    if (host === undefined || host === "") {
      return false;
    }

    const result = getInstanceIDFromHost(host);
    if (result.kind === "error") {
      return false;
    }

    const instance = getServableInstanceById(result.instanceId);
    if (instance === undefined) {
      return false;
    }

    const clientAddress =
      getHeaderValue(rawRequest, "x-internal-real-ip") ?? socket.remoteAddress;
    const rawWithoutInternalHeaders = stripInternalHeaders(
      rawRequest,
      INTERNAL_HEADER_NAMES,
    );
    const log = createHttpLog(
      instance.id,
      clientAddress,
      rawWithoutInternalHeaders,
    );

    const outcome = addLogWithOutcome(log);
    if (!outcome.tombstoned) {
      broadcastLog(log);
    }
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const createInstancesServer = (
  port: number,
  listenFn: typeof listen = listen,
) => {
  const server = listenFn<SocketData>({
    hostname: "0.0.0.0",
    port,
    socket: {
      open(socket) {
        socket.data = {
          buffer: new HttpRequestBuffer(),
        };
        socket.timeout(30);
      },
      async data(socket, data) {
        let didLog = false;

        try {
          socket.data.buffer.append(new Uint8Array(data));

          if (socket.data.buffer.hasError()) {
            didLog = tryLogInteraction(socket, socket.data.buffer.getRaw());
            respond(
              socket,
              createResponse("400 Bad Request", socket.data.buffer.getError()),
            );
            return;
          }

          if (!socket.data.buffer.isComplete()) {
            return;
          }

          const rawRequest = socket.data.buffer.getRaw();
          const host = getHeaderValue(rawRequest, "host");

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

          const instance = getServableInstanceById(result.instanceId);
          if (!instance) {
            respond(
              socket,
              createResponse("400 Bad Request", "Instance not found"),
            );
            return;
          }

          const clientAddress =
            getHeaderValue(rawRequest, "x-internal-real-ip") ??
            socket.remoteAddress;
          const rawWithoutInternalHeaders = stripInternalHeaders(
            rawRequest,
            INTERNAL_HEADER_NAMES,
          );
          const log = createHttpLog(
            instance.id,
            clientAddress,
            rawWithoutInternalHeaders,
          );

          const outcome = addLogWithOutcome(log);
          if (!outcome.tombstoned) {
            broadcastLog(log);
          }
          didLog = true;

          respond(
            socket,
            encodeInstanceResponse(
              selectInstanceResponse(instance, rawRequest),
            ),
          );
        } catch (error) {
          console.error(error);
          if (!didLog) {
            didLog = tryLogInteraction(socket, socket.data.buffer.getRaw());
          }
          respond(
            socket,
            createResponse("500 Internal Server Error", "Something went wrong"),
          );
          return;
        }
      },
    },
  });

  console.log(`Instances server running on port ${port}`);
  return server;
};
