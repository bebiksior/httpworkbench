import type { Socket } from "bun";
import type { ZodTypeAny } from "zod";
import { HttpForge } from "ts-http-forge";
import { instancePolicies } from "../config";

const encoder = new TextEncoder();
const staticResponseLimitBytes = instancePolicies.rawLimitBytes;
const staticResponseLimitMb = staticResponseLimitBytes / (1024 * 1024);
const instanceIdAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const instanceIdLength = 8;

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

export const respond = (socket: Socket, raw: Uint8Array) => {
  socket.write(raw);
  socket.end();
};

export const generateInstanceID = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(instanceIdLength));
  let id = "";
  for (const byte of bytes) {
    id += instanceIdAlphabet[byte % instanceIdAlphabet.length];
  }
  return id;
};

type ParseJsonSuccess<Schema extends ZodTypeAny> = {
  kind: "ok";
  data: Schema["_output"];
};

type ParseJsonError = {
  kind: "error";
  response: Response;
};

export const parseJsonRequest = async <Schema extends ZodTypeAny>(
  req: Request,
  schema: Schema,
): Promise<ParseJsonSuccess<Schema> | ParseJsonError> => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      kind: "error",
      response: Response.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      kind: "error",
      response: Response.json({ error: "Invalid body" }, { status: 400 }),
    };
  }

  return {
    kind: "ok",
    data: parsed.data,
  };
};

type StaticResponseLimitResult =
  | { kind: "ok" }
  | { kind: "error"; response: Response };

export const ensureStaticResponseWithinLimit = (
  raw: string,
): StaticResponseLimitResult => {
  if (encoder.encode(raw).length > staticResponseLimitBytes) {
    return {
      kind: "error",
      response: Response.json(
        { error: `Static response exceeds ${staticResponseLimitMb}MB limit` },
        { status: 413 },
      ),
    };
  }
  return { kind: "ok" };
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
