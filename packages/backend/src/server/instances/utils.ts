import type { Socket } from "bun";
import { HttpForge } from "ts-http-forge";
import { dnsConfig } from "../../config";
import { resolveInstanceName } from "../nameResolution";

const encoder = new TextEncoder();

export const createResponse = (status: string, message: string) => {
  return new TextEncoder().encode(
    `HTTP/1.1 ${status}\r\nContent-Type: text/plain\r\n\r\n${message}`,
  );
};

type InstanceHostResult =
  | {
      kind: "ok";
      instanceId: string;
    }
  | {
      kind: "error";
      error: string;
    };

export const parseInstanceIdFromHost = (
  host: string,
  instancesDomain: string,
): InstanceHostResult => {
  const resolution = resolveInstanceName(host, instancesDomain);
  switch (resolution.kind) {
    case "zone":
    case "missing_instance":
      return {
        kind: "error",
        error: "Host is empty",
      };
    case "out_of_zone":
      return {
        kind: "error",
        error: "Host does not end with instances domain",
      };
    case "instance":
      return {
        kind: "ok",
        instanceId: resolution.instanceId,
      };
  }
};

export const getInstanceIDFromHost = (host: string): InstanceHostResult => {
  return parseInstanceIdFromHost(host, dnsConfig.instancesDomain);
};

export const respond = <T>(socket: Socket<T>, raw: Uint8Array) => {
  socket.write(raw);
  socket.end();
};

export const stripInternalHeaders = (
  rawRequest: string,
  headerNames: string[],
): string => {
  const lowerHeaders = headerNames.map((header) => `${header.toLowerCase()}:`);

  return rawRequest
    .split("\r\n")
    .filter((line) => {
      const lowerLine = line.toLowerCase();
      return !lowerHeaders.some((header) => lowerLine.startsWith(header));
    })
    .join("\r\n");
};

export const adjustContentLength = (raw: string): string => {
  try {
    const bodyStartMarker = "\r\n\r\n";
    const bodyStartIndex = raw.indexOf(bodyStartMarker);

    if (bodyStartIndex === -1) {
      return raw;
    }

    const body = raw.substring(bodyStartIndex + bodyStartMarker.length);
    const bodyLength = encoder.encode(body).length;

    return HttpForge.create(raw)
      .setHeader("Content-Length", bodyLength.toString())
      .build();
  } catch {
    return raw;
  }
};
