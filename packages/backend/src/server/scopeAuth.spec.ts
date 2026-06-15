import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import type { ApiKey, ApiKeyScope, UserRecord } from "shared";

process.env.JWT_SECRET = "scope-auth-test-secret";

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

const loadModules = async () => {
  const auth = await import("./auth");
  const apiKeyAuth = await import("./apiKeyAuth");
  return { auth, apiKeyAuth };
};

const seedUser = () => {
  state.apiKeys.clear();
  state.users.clear();
  state.users.set("user-1", {
    id: "user-1",
    googleId: "google-user-1",
    createdAt: 1,
  });
};

const bearer = (token: string): Request =>
  new Request("http://localhost/test", {
    headers: { authorization: `Bearer ${token}` },
  });

describe("scoped API access", () => {
  beforeEach(seedUser);

  test("apiKeyMissingScope gates only API keys, not sessions or anonymous", async () => {
    const { auth, apiKeyAuth } = await loadModules();
    const created = apiKeyAuth.createApiKeyForUser({
      userId: "user-1",
      name: "k",
      scopes: ["logs:read"],
    });

    const sessionCtx = await auth.resolveOptionalAccess(
      bearer(await auth.issueAuthToken("user-1")),
    );
    const apiCtx = await auth.resolveOptionalAccess(bearer(created.secret));

    expect(sessionCtx?.via).toBe("session");
    expect(apiCtx?.via).toBe("api_key");
    expect(auth.apiKeyMissingScope(sessionCtx, "instances:delete")).toBe(false);
    expect(auth.apiKeyMissingScope(undefined, "logs:read")).toBe(false);
    expect(auth.apiKeyMissingScope(apiCtx, "logs:read")).toBe(false);
    expect(auth.apiKeyMissingScope(apiCtx, "instances:delete")).toBe(true);
  });

  test("resolveOptionalAccess returns undefined for anonymous and invalid keys", async () => {
    const { auth } = await loadModules();

    expect(
      await auth.resolveOptionalAccess(new Request("http://localhost/test")),
    ).toBeUndefined();
    expect(
      await auth.resolveOptionalAccess(bearer("hwb_not_a_real_key")),
    ).toBeUndefined();
  });
});

const authedRequest = (path: string, token: string): Request =>
  new Request(`http://localhost${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });

describe("auth macro enforcement (e2e)", () => {
  beforeEach(seedUser);

  test("scope route enforces the scope across keys, sessions, and anonymous", async () => {
    const { auth, apiKeyAuth } = await loadModules();
    const app = new Elysia()
      .use(auth.authPlugin)
      .get("/scoped", ({ user }) => ({ id: user.id }), {
        scope: "instances:read",
      });

    const readKey = apiKeyAuth.createApiKeyForUser({
      userId: "user-1",
      name: "read",
      scopes: ["instances:read"],
    });
    const writeKey = apiKeyAuth.createApiKeyForUser({
      userId: "user-1",
      name: "write",
      scopes: ["instances:write"],
    });
    const sessionToken = await auth.issueAuthToken("user-1");
    const unknownKey = `hwb_${"0".repeat(18)}_${"0".repeat(64)}`;

    const withScope = await app.handle(
      authedRequest("/scoped", readKey.secret),
    );
    const missingScope = await app.handle(
      authedRequest("/scoped", writeKey.secret),
    );
    const viaSession = await app.handle(authedRequest("/scoped", sessionToken));
    const anonymous = await app.handle(new Request("http://localhost/scoped"));
    const invalidKey = await app.handle(authedRequest("/scoped", unknownKey));

    expect(withScope.status).toBe(200);
    expect(missingScope.status).toBe(403);
    expect(missingScope.headers.get("WWW-Authenticate")).toContain(
      "insufficient_scope",
    );
    expect(viaSession.status).toBe(200);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect(invalidKey.status).toBe(401);
  });

  test("session route accepts a JWT but rejects API keys", async () => {
    const { auth, apiKeyAuth } = await loadModules();
    const app = new Elysia()
      .use(auth.authPlugin)
      .get("/session", ({ user }) => ({ id: user.id }), { session: true });

    const key = apiKeyAuth.createApiKeyForUser({
      userId: "user-1",
      name: "key",
    });
    const sessionToken = await auth.issueAuthToken("user-1");

    const viaKey = await app.handle(authedRequest("/session", key.secret));
    const viaSession = await app.handle(
      authedRequest("/session", sessionToken),
    );

    expect(viaKey.status).toBe(401);
    expect(viaSession.status).toBe(200);
  });

  test("session route accepts the auth_token cookie", async () => {
    const { auth } = await loadModules();
    const app = new Elysia()
      .use(auth.authPlugin)
      .get("/session", ({ user }) => ({ id: user.id }), { session: true });

    const sessionToken = await auth.issueAuthToken("user-1");
    const viaCookie = await app.handle(
      new Request("http://localhost/session", {
        headers: { cookie: `auth_token=${sessionToken}` },
      }),
    );

    expect(viaCookie.status).toBe(200);
    expect(await viaCookie.json()).toEqual({ id: "user-1" });
  });
});
