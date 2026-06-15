import { listen, type Socket } from "bun";
import { parse } from "http-z";
import { type Log } from "shared";
import { addLog } from "../../storage";
import { getInstanceById } from "../../storage/repositories/instances";
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

    const instance = getInstanceById(result.instanceId);
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

    addLog(log);
    broadcastLog(log);
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
          const request = parse(rawRequest);

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

          const instance = getInstanceById(result.instanceId);
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

          addLog(log);
          broadcastLog(log);
          didLog = true;

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
