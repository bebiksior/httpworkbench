import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { ApiKey, ApiKeyScope, User } from "shared";
import {
  addApiKey,
  getActiveApiKeyByPrefix,
  getUserById,
  markApiKeyUsed,
  toPublicUser,
} from "../storage";

const keyHashSecret = Bun.env.JWT_SECRET;

if (keyHashSecret === undefined || keyHashSecret === "") {
  throw new Error("JWT_SECRET must be set");
}

export const API_KEY_SCOPES = [
  "instances:read",
  "instances:write",
  "instances:delete",
  "logs:read",
  "logs:stream",
] as const satisfies ApiKeyScope[];

export type ApiKeyAuthContext = {
  apiKey: ApiKey;
  user: User;
};

const randomKeyToken = (bytes: number) => randomBytes(bytes).toString("hex");

export const hashApiKeySecret = (secret: string): string => {
  return createHmac("sha256", keyHashSecret).update(secret).digest("base64url");
};

const safeEqual = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
};

export const createApiKeySecret = () => {
  const publicId = randomKeyToken(9);
  const secret = randomKeyToken(32);
  const prefix = `hwb_${publicId}`;
  const rawKey = `${prefix}_${secret}`;
  return { prefix, secret, rawKey };
};

export const createApiKeyForUser = (input: {
  userId: string;
  name: string;
  scopes?: ApiKeyScope[];
  expiresAt?: number;
}) => {
  const keySecret = createApiKeySecret();
  const apiKey = addApiKey({
    id: crypto.randomUUID(),
    userId: input.userId,
    name: input.name,
    prefix: keySecret.prefix,
    secretHash: hashApiKeySecret(keySecret.secret),
    scopes: input.scopes ?? [...API_KEY_SCOPES],
    createdAt: Date.now(),
    expiresAt: input.expiresAt,
  });

  return {
    apiKey,
    secret: keySecret.rawKey,
  };
};

const extractBearer = (header: string): string | undefined => {
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return undefined;
  }
  return parts[1];
};

const parseApiKey = (rawKey: string) => {
  const parts = rawKey.split("_");
  const publicId = parts[1] ?? "";
  const secret = parts[2] ?? "";
  if (
    parts.length !== 3 ||
    parts[0] !== "hwb" ||
    !/^[0-9a-f]{18}$/.test(publicId) ||
    !/^[0-9a-f]{64}$/.test(secret)
  ) {
    return undefined;
  }
  return {
    prefix: `hwb_${publicId}`,
    secret,
  };
};

export const authenticateApiKeyValue = (
  rawKey: string,
): ApiKeyAuthContext | undefined => {
  const parsed = parseApiKey(rawKey);
  if (parsed === undefined || parsed.secret === "") {
    return undefined;
  }

  const now = Date.now();
  const apiKey = getActiveApiKeyByPrefix(parsed.prefix, now);
  if (apiKey === undefined) {
    return undefined;
  }

  if (!safeEqual(apiKey.secretHash, hashApiKeySecret(parsed.secret))) {
    return undefined;
  }

  const userRecord = getUserById(apiKey.userId);
  if (userRecord === undefined) {
    return undefined;
  }

  markApiKeyUsed(apiKey.id, now);
  const { secretHash: _secretHash, ...publicApiKey } = apiKey;
  return {
    apiKey: { ...publicApiKey, lastUsedAt: now },
    user: toPublicUser(userRecord),
  };
};

export const authenticateApiKeyRequest = (
  req: Request,
): ApiKeyAuthContext | undefined => {
  const authHeader = req.headers.get("authorization");
  if (authHeader === null) {
    return undefined;
  }
  const rawKey = extractBearer(authHeader);
  return rawKey === undefined ? undefined : authenticateApiKeyValue(rawKey);
};

export const hasApiKeyScope = (apiKey: ApiKey, scope: ApiKeyScope): boolean => {
  return apiKey.scopes.includes(scope);
};
