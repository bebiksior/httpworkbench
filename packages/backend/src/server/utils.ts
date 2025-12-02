import type { ZodTypeAny } from "zod";
import { instancePolicies } from "../config";

const encoder = new TextEncoder();
const staticResponseLimitBytes = instancePolicies.rawLimitBytes;
const staticResponseLimitMb = staticResponseLimitBytes / (1024 * 1024);
const instanceIdAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const instanceIdLength = 8;

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
