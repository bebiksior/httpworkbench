import { listen } from "bun";
import { parse } from "http-z";
import { type Log } from "shared";
import { addLog } from "../../storage";
import { getInstanceById } from "../../storage/repositories/instances";
import { broadcastLog } from "./logStream";
import { HttpRequestBuffer } from "./httpBuffer";
import {
  adjustContentLength,
  createResponse,
  getInstanceIDFromHost,
  respond,
} from "./utils";

type SocketData = {
  buffer: HttpRequestBuffer;
};

export const createInstancesServer = (port: number) => {
  const server = listen<SocketData>({
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
        try {
          socket.data.buffer.append(new Uint8Array(data));

          if (socket.data.buffer.hasError()) {
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

          const instance = await getInstanceById(result.instanceId);
          if (!instance) {
            respond(
              socket,
              createResponse("400 Bad Request", "Instance not found"),
            );
            return;
          }

          const realIpHeader = request.headers.find(
            (header) => header.name.toLowerCase() === "x-internal-real-ip",
          )?.value;
          const clientAddress = realIpHeader ?? socket.remoteAddress;

          const rawWithoutInternalHeaders = rawRequest
            .split("\r\n")
            .filter(
              (line) => !line.toLowerCase().startsWith("x-internal-real-ip:"),
            )
            .join("\r\n");

          const log = {
            id: crypto.randomUUID(),
            instanceId: instance.id,
            type: "http",
            timestamp: Date.now(),
            address: clientAddress,
            raw: rawWithoutInternalHeaders,
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

  console.log(`Instances server running on port ${port}`);
  return server;
};
