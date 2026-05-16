import type { ApiKey, ApiKeyScope } from "shared";
import { ApiKeySchema } from "shared";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { apiKeys } from "../schema";

type ApiKeyRow = typeof apiKeys.$inferSelect;

type ApiKeySecretRecord = ApiKey & {
  secretHash: string;
};

const toApiKey = (row: ApiKeyRow): ApiKey => {
  return ApiKeySchema.parse({
    id: row.id,
    userId: row.userId,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopesJson,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? undefined,
    expiresAt: row.expiresAt ?? undefined,
  });
};

const toApiKeySecretRecord = (row: ApiKeyRow): ApiKeySecretRecord => {
  return {
    ...toApiKey(row),
    secretHash: row.secretHash,
  };
};

export function addApiKey(input: {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  secretHash: string;
  scopes: ApiKeyScope[];
  createdAt: number;
  expiresAt?: number;
}): ApiKey {
  const row = {
    id: input.id,
    userId: input.userId,
    name: input.name,
    prefix: input.prefix,
    secretHash: input.secretHash,
    scopesJson: input.scopes,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt ?? null,
  };
  getDb().insert(apiKeys).values(row).run();
  return toApiKey({ ...row, lastUsedAt: null });
}

export function getActiveApiKeyByPrefix(
  prefix: string,
  now: number,
): ApiKeySecretRecord | undefined {
  const row = getDb()
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.prefix, prefix))
    .get();
  if (row === undefined) {
    return undefined;
  }
  if (row.expiresAt !== null && row.expiresAt <= now) {
    return undefined;
  }
  return toApiKeySecretRecord(row);
}

export function getApiKeysByOwner(userId: string): ApiKey[] {
  return getDb()
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(asc(apiKeys.createdAt), asc(apiKeys.id))
    .all()
    .map(toApiKey);
}

export function getApiKeyById(id: string): ApiKey | undefined {
  const row = getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  return row === undefined ? undefined : toApiKey(row);
}

export function markApiKeyUsed(id: string, lastUsedAt: number): void {
  getDb().update(apiKeys).set({ lastUsedAt }).where(eq(apiKeys.id, id)).run();
}

export function deleteApiKey(id: string): ApiKey | undefined {
  const current = getApiKeyById(id);
  if (current === undefined) {
    return undefined;
  }
  getDb().delete(apiKeys).where(eq(apiKeys.id, id)).run();
  return current;
}
