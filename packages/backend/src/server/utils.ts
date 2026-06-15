import { instancePolicies } from "../config";
import type { LogsPageCursor } from "../storage";

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

type StaticRawError = { status: number; error: string };

export const ensureStaticResponseWithinLimit = (
  raw: string,
): StaticRawError | undefined => {
  if (encoder.encode(raw).length > staticResponseLimitBytes) {
    return {
      status: 413,
      error: `Static response exceeds ${staticResponseLimitMb}MB limit`,
    };
  }
  return undefined;
};

const staticHttpLineBreakPattern = /\r?\n/;
const staticHttpHeaderSeparatorPattern = /\r?\n\r?\n/;

export const normalizeStaticHttpRaw = (raw: string): string => {
  const separatorMatch = staticHttpHeaderSeparatorPattern.exec(raw);
  if (separatorMatch?.index === undefined) {
    return raw;
  }

  const headerBlock = raw.slice(0, separatorMatch.index);
  const body = raw.slice(separatorMatch.index + separatorMatch[0].length);

  return `${headerBlock.split(staticHttpLineBreakPattern).join("\r\n")}\r\n\r\n${body}`;
};

const DEFAULT_LOG_LIMIT = 50;
export const MAX_LOG_LIMIT = 500;

export const clampLogLimit = (limit?: number): number => {
  return Math.min(Math.max(limit ?? DEFAULT_LOG_LIMIT, 1), MAX_LOG_LIMIT);
};

export const encodeLogsCursor = (cursor: LogsPageCursor): string => {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
};

export const decodeLogsCursor = (
  cursor: string,
): LogsPageCursor | undefined => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      decoded !== null &&
      typeof decoded === "object" &&
      typeof decoded.seq === "number" &&
      Number.isInteger(decoded.seq) &&
      decoded.seq >= 0
    ) {
      return { seq: decoded.seq };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

export const ensureValidStaticHttpRaw = (
  raw: string,
): StaticRawError | undefined => {
  const trimmedStart = raw.trimStart();
  if (!trimmedStart.startsWith("HTTP/")) {
    return {
      status: 400,
      error:
        "Static response must start with an HTTP status line (e.g. HTTP/1.1 200 OK)",
    };
  }
  const headerSeparatorMatch = staticHttpHeaderSeparatorPattern.exec(raw);
  if (headerSeparatorMatch === null) {
    return {
      status: 400,
      error:
        "Static response must include a blank line between headers and body (\\r\\n\\r\\n)",
    };
  }
  const firstLine = raw.split(staticHttpLineBreakPattern)[0];
  if (firstLine === undefined || firstLine === "") {
    return { status: 400, error: "Invalid HTTP status line" };
  }
  if (!/^HTTP\/\d+\.\d+\s+\d{3}/.test(firstLine)) {
    return { status: 400, error: "Invalid HTTP status line" };
  }
  return undefined;
};

export const validateStaticRaw = (
  raw: string,
): { ok: true; raw: string } | { ok: false; status: number; error: string } => {
  const normalized = normalizeStaticHttpRaw(raw);
  const error =
    ensureStaticResponseWithinLimit(normalized) ??
    ensureValidStaticHttpRaw(normalized);
  if (error !== undefined) {
    return { ok: false, ...error };
  }
  return { ok: true, raw: normalized };
};
