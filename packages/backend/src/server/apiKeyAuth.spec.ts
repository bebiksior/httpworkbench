import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ApiKey, ApiKeyScope, UserRecord } from "shared";

process.env.JWT_SECRET = "api-key-auth-test-secret";

type ApiKeySecretRecord = ApiKey & {
  secretHash: string;
};

const state = {
  apiKeys: new Map<string, ApiKeySecretRecord>(),
  users: new Map<string, UserRecord>(),
};

mock.module("../storage", () => ({
  addApiKey: (input: {
    id: string;
    userId: string;
    name: string;
    prefix: string;
    secretHash: string;
    scopes: ApiKeyScope[];
    createdAt: number;
    expiresAt?: number;
  }): ApiKey => {
    const apiKey = {
      id: input.id,
      userId: input.userId,
      name: input.name,
      prefix: input.prefix,
      secretHash: input.secretHash,
      scopes: input.scopes,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    };
    state.apiKeys.set(input.prefix, apiKey);
    const { secretHash: _secretHash, ...publicApiKey } = apiKey;
    return publicApiKey;
  },
  getActiveApiKeyByPrefix: (
    prefix: string,
    now: number,
  ): ApiKeySecretRecord | undefined => {
    const apiKey = state.apiKeys.get(prefix);
    if (apiKey?.expiresAt !== undefined && apiKey.expiresAt <= now) {
      return undefined;
    }
    return apiKey;
  },
  getUserById: (id: string): UserRecord | undefined => state.users.get(id),
  markApiKeyUsed: (id: string, lastUsedAt: number): void => {
    for (const [prefix, apiKey] of state.apiKeys) {
      if (apiKey.id === id) {
        state.apiKeys.set(prefix, { ...apiKey, lastUsedAt });
        return;
      }
    }
  },
  toPublicUser: (user: UserRecord) => ({
    id: user.id,
    googleId: user.googleId,
    createdAt: user.createdAt,
  }),
}));

const loadAuthModule = async () => await import("./apiKeyAuth");

describe("API key auth", () => {
  beforeEach(() => {
    state.apiKeys.clear();
    state.users.clear();
    state.users.set("user-1", {
      id: "user-1",
      googleId: "google-user-1",
      createdAt: 1,
    });
  });

  test("creates a raw secret once and stores only its hash", async () => {
    const { createApiKeyForUser } = await loadAuthModule();

    const created = createApiKeyForUser({
      userId: "user-1",
      name: "Claude Desktop",
    });

    expect(created.secret.startsWith(`${created.apiKey.prefix}_`)).toBe(true);
    const stored = state.apiKeys.get(created.apiKey.prefix);

    expect(stored?.secretHash).toBeDefined();
    expect(stored?.secretHash).not.toContain(created.secret);
    expect(stored?.prefix).toBe(created.apiKey.prefix);
  });

  test("authenticates valid keys and updates last used timestamp", async () => {
    const { authenticateApiKeyValue, createApiKeyForUser } =
      await loadAuthModule();
    const created = createApiKeyForUser({
      userId: "user-1",
      name: "Claude Desktop",
    });

    const auth = authenticateApiKeyValue(created.secret);

    expect(auth?.user.id).toBe("user-1");
    expect(auth?.apiKey.id).toBe(created.apiKey.id);
    expect(typeof state.apiKeys.get(created.apiKey.prefix)?.lastUsedAt).toBe(
      "number",
    );
  });

  test("rejects deleted and malformed keys", async () => {
    const { authenticateApiKeyValue, createApiKeyForUser } =
      await loadAuthModule();
    const created = createApiKeyForUser({
      userId: "user-1",
      name: "Claude Desktop",
    });
    state.apiKeys.delete(created.apiKey.prefix);

    expect(authenticateApiKeyValue(created.secret)).toBeUndefined();
    expect(authenticateApiKeyValue("not-a-key")).toBeUndefined();
    expect(
      authenticateApiKeyValue(`${created.apiKey.prefix}_wrong-secret`),
    ).toBeUndefined();
  });
});
