import type { Socket } from "bun";
import { HttpForge } from "ts-http-forge";

const encoder = new TextEncoder();

export const createResponse = (status: string, message: string) => {
  return new TextEncoder().encode(
    `HTTP/1.1 ${status}\r\nContent-Type: text/plain\r\n\r\n${message}`,
  );
};

export const getInstanceIDFromHost = (
  host: string,
):
  | {
      kind: "ok";
      instanceId: string;
    }
  | {
      kind: "error";
      error: string;
    } => {
  const DOMAIN = Bun.env.DOMAIN;

  if (DOMAIN === undefined || DOMAIN === "") {
    throw new Error("DOMAIN environment variable is not set");
  }

  const instancesSubdomain = `instances.${DOMAIN}`;

  if (!host.endsWith(instancesSubdomain)) {
    return {
      kind: "error",
      error: "Host does not end with instances subdomain",
    };
  }

  const prefix = host.slice(0, host.length - instancesSubdomain.length - 1);

  if (prefix === "") {
    return {
      kind: "error",
      error: "Host is empty",
    };
  }

  const parts = prefix.split(".");
  const instanceId = parts[parts.length - 1];

  if (instanceId === undefined || instanceId === "") {
    return {
      kind: "error",
      error: "Instance ID is empty",
    };
  }

  return {
    kind: "ok",
    instanceId,
  };
};

export const respond = <T>(socket: Socket<T>, raw: Uint8Array) => {
  socket.write(raw);
  socket.end();
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
