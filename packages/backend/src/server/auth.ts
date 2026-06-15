import { Elysia, status } from "elysia";
import * as jose from "jose";
import type { ApiKey, ApiKeyScope, User } from "shared";
import { getUserById, toPublicUser } from "../storage";
import type { ApiKeyAuthContext } from "./apiKeyAuth";
import { authenticateApiKeyValue, hasApiKeyScope } from "./apiKeyAuth";
import { createFixedWindowRateLimiter } from "./rateLimit";

const jwtSecret = Bun.env.JWT_SECRET;

if (jwtSecret === undefined || jwtSecret === "") {
  throw new Error("JWT_SECRET must be set");
}

if (jwtSecret === "your-jwt-secret-here") {
  throw new Error(
    "JWT_SECRET must be changed, you are using the default secret",
  );
}

const secret = new TextEncoder().encode(jwtSecret);

export const issueAuthToken = async (userId: string) => {
  return await new jose.SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
};

const extractBearer = (header: string) => {
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return undefined;
  }
  return parts[1];
};

const authenticateSession = async (
  req: Request,
  sessionCookie?: string,
): Promise<User | undefined> => {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader !== null ? extractBearer(authHeader) : undefined;
  const token = bearer ?? sessionCookie;

  if (token === undefined) {
    return undefined;
  }

  let sub: string | undefined;
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    sub = typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }

  if (sub === undefined) {
    return undefined;
  }

  const userRecord = getUserById(sub);
  return userRecord === undefined ? undefined : toPublicUser(userRecord);
};

type AccessContext =
  | { via: "session"; user: User }
  | { via: "api_key"; user: User; apiKey: ApiKey };

const apiKeyRequestsPerMinute = 300;

const apiKeyRateLimiter = createFixedWindowRateLimiter({
  maxRequests: apiKeyRequestsPerMinute,
  windowMs: 60_000,
});

const bearerRealm = 'Bearer realm="httpworkbench-api"';

const apiKeyContext = (auth: ApiKeyAuthContext): AccessContext => ({
  via: "api_key",
  user: auth.user,
  apiKey: auth.apiKey,
});

const readApiKeyBearer = (
  req: Request,
):
  | { present: false }
  | { present: true; auth: ApiKeyAuthContext | undefined } => {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader !== null ? extractBearer(authHeader) : undefined;
  if (bearer === undefined) {
    return { present: false };
  }
  if (!bearer.startsWith("hwb_")) {
    return { present: false };
  }
  return { present: true, auth: authenticateApiKeyValue(bearer) };
};

type AccessOutcome =
  | { ok: true; context: AccessContext }
  | { ok: false; httpStatus: number; error: string; wwwAuthenticate?: string };

const resolveAccessOutcome = async (
  req: Request,
  sessionCookie?: string,
): Promise<AccessOutcome> => {
  const apiKey = readApiKeyBearer(req);
  if (apiKey.present) {
    if (apiKey.auth === undefined) {
      return {
        ok: false,
        httpStatus: 401,
        error: "Unauthorized",
        wwwAuthenticate: bearerRealm,
      };
    }
    if (!apiKeyRateLimiter.check(apiKey.auth.apiKey.id)) {
      return { ok: false, httpStatus: 429, error: "Rate limit exceeded" };
    }
    return { ok: true, context: apiKeyContext(apiKey.auth) };
  }

  const user = await authenticateSession(req, sessionCookie);
  if (user === undefined) {
    return {
      ok: false,
      httpStatus: 401,
      error: "Unauthorized",
      wwwAuthenticate: bearerRealm,
    };
  }
  return { ok: true, context: { via: "session", user } };
};

export const resolveOptionalAccess = async (
  req: Request,
  sessionCookie?: string,
): Promise<AccessContext | undefined> => {
  const apiKey = readApiKeyBearer(req);
  if (apiKey.present) {
    return apiKey.auth === undefined ? undefined : apiKeyContext(apiKey.auth);
  }
  const user = await authenticateSession(req, sessionCookie);
  return user === undefined ? undefined : { via: "session", user };
};

export const enforceApiKeyRateLimit = (
  access: AccessContext | undefined,
): boolean => {
  if (access?.via !== "api_key") {
    return true;
  }
  return apiKeyRateLimiter.check(access.apiKey.id);
};

export const apiKeyMissingScope = (
  access: AccessContext | undefined,
  scope: ApiKeyScope,
): boolean =>
  access?.via === "api_key" && !hasApiKeyScope(access.apiKey, scope);

export const insufficientScopeResponse = (scope: ApiKeyScope): Response =>
  Response.json(
    { error: `Missing required scope: ${scope}` },
    {
      status: 403,
      headers: {
        "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${scope}"`,
      },
    },
  );

export const readSessionCookie = (cookie: {
  auth_token?: { value: unknown };
}): string | undefined => {
  const value = cookie.auth_token?.value;
  return typeof value === "string" ? value : undefined;
};

export const authPlugin = new Elysia({ name: "auth" }).macro({
  session: {
    async resolve({ request, set, cookie }) {
      const user = await authenticateSession(
        request,
        readSessionCookie(cookie),
      );
      if (user === undefined) {
        set.headers["WWW-Authenticate"] = bearerRealm;
        return status(401, { error: "Unauthorized" });
      }
      return { user };
    },
  },
  scope(required: ApiKeyScope) {
    return {
      async resolve({ request, set, cookie }) {
        const outcome = await resolveAccessOutcome(
          request,
          readSessionCookie(cookie),
        );
        if (!outcome.ok) {
          if (outcome.wwwAuthenticate !== undefined) {
            set.headers["WWW-Authenticate"] = outcome.wwwAuthenticate;
          }
          return status(outcome.httpStatus, { error: outcome.error });
        }
        if (apiKeyMissingScope(outcome.context, required)) {
          set.headers["WWW-Authenticate"] =
            `Bearer error="insufficient_scope", scope="${required}"`;
          return status(403, { error: `Missing required scope: ${required}` });
        }
        return { access: outcome.context, user: outcome.context.user };
      },
    };
  },
});
