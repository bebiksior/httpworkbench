import { Elysia, t } from "elysia";
import { Google, generateCodeVerifier, generateState } from "arctic";
import * as jose from "jose";
import { ApiKeySignInSchema, PasswordSignInSchema } from "shared";
import { authMode } from "../../config";
import {
  addUser,
  getLocalCredentialsByUsername,
  getUserByGoogleId,
  getUserById,
  toPublicUser,
} from "../../storage";
import {
  API_KEY_SCOPES,
  authenticateApiKeyValue,
  hasApiKeyScope,
} from "../apiKeyAuth";
import { authPlugin, issueAuthToken } from "../auth";
import { createBoundedProtocolRateLimiter } from "../protocolRateLimit";

const googleClientId = Bun.env.GOOGLE_CLIENT_ID;
const googleClientSecret = Bun.env.GOOGLE_CLIENT_SECRET;
const frontendUrl = Bun.env.FRONTEND_URL;

if (frontendUrl === undefined || frontendUrl === "") {
  throw new Error("FRONTEND_URL must be set");
}
const frontendOrigin = new URL(frontendUrl).origin;

const createGoogle = () => {
  if (
    googleClientId === undefined ||
    googleClientId === "" ||
    googleClientSecret === undefined ||
    googleClientSecret === ""
  ) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for Google authentication",
    );
  }
  return new Google(
    googleClientId,
    googleClientSecret,
    `${frontendUrl}/api/auth/google/callback`,
  );
};
const google = authMode === "google" ? createGoogle() : undefined;
const isSecure = frontendUrl.startsWith("https://");

const sessionCookie = {
  httpOnly: true,
  secure: isSecure,
  sameSite: "lax",
  path: "/",
  maxAge: 2592000,
} as const;

const oauthFlowCookie = {
  httpOnly: true,
  secure: isSecure,
  path: "/",
  maxAge: 300,
} as const;

const passwordSignInRateLimiter = createBoundedProtocolRateLimiter({
  maxRequests: 5,
  windowMs: 60_000,
  maxEntries: 10_000,
});

const cookieSchema = t.Cookie({
  auth_token: t.Optional(t.String()),
  oauth_state: t.Optional(t.String()),
  oauth_code_verifier: t.Optional(t.String()),
});

export const oauthRoutes = new Elysia({ name: "routes/oauth" })
  .use(authPlugin)
  .guard({ detail: { hide: true } })
  .post(
    "/api/auth/api-key",
    async ({ body, cookie, status }) => {
      const auth = authenticateApiKeyValue(body.apiKey.trim());
      if (auth === undefined) {
        return status(401, { error: "Invalid API key" });
      }
      const hasAllScopes = API_KEY_SCOPES.every((scope) =>
        hasApiKeyScope(auth.apiKey, scope),
      );
      if (!hasAllScopes) {
        return status(403, {
          error:
            "This API key is scoped; dashboard sign-in requires a key with all scopes",
        });
      }
      cookie.auth_token.set({
        value: await issueAuthToken(auth.user.id, { apiKey: auth.apiKey }),
        ...sessionCookie,
      });
      return auth.user;
    },
    { body: ApiKeySignInSchema, cookie: cookieSchema },
  )
  .post(
    "/api/auth/password",
    async ({ body, cookie, request, status }) => {
      if (authMode !== "password") return status(404, { error: "Not found" });
      const origin = request.headers.get("origin");
      if (
        (origin !== null && origin !== frontendOrigin) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      ) {
        return status(403, { error: "Invalid origin" });
      }
      const address = request.headers.get("x-internal-real-ip") ?? "unknown";
      if (!passwordSignInRateLimiter.check(address, Date.now())) {
        return status(429, { error: "Too many sign-in attempts" });
      }
      const credentials = getLocalCredentialsByUsername(body.username);
      const user =
        credentials === undefined ? undefined : getUserById(credentials.userId);
      if (
        credentials === undefined ||
        user === undefined ||
        !(await Bun.password.verify(body.password, credentials.passwordHash))
      ) {
        return status(401, { error: "Invalid username or password" });
      }
      cookie.auth_token.set({
        value: await issueAuthToken(user.id, {
          passwordRevision: credentials.revision,
        }),
        ...sessionCookie,
      });
      return toPublicUser(user);
    },
    { body: PasswordSignInSchema, cookie: cookieSchema },
  )
  .get(
    "/api/auth/google",
    ({ cookie, redirect, status }) => {
      if (google === undefined) return status(404, { error: "Not found" });
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const authUrl = google.createAuthorizationURL(state, codeVerifier, [
        "openid",
        "email",
        "profile",
      ]);

      cookie.oauth_state.set({ value: state, ...oauthFlowCookie });
      cookie.oauth_code_verifier.set({
        value: codeVerifier,
        ...oauthFlowCookie,
      });

      return redirect(authUrl.toString());
    },
    { cookie: cookieSchema },
  )
  .get(
    "/api/auth/google/callback",
    async ({ request, cookie, redirect, status }) => {
      if (google === undefined) return status(404, { error: "Not found" });
      try {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (code === null || code === "" || state === null || state === "") {
          return status(400, "Missing code/state");
        }
        if (cookie.oauth_state.value !== state) {
          return status(400, "Invalid state");
        }
        const codeVerifier = cookie.oauth_code_verifier.value ?? "";
        if (codeVerifier === "") {
          return status(400, "Missing code verifier");
        }

        const tokens = await google.validateAuthorizationCode(
          code,
          codeVerifier,
        );
        const idToken = tokens.idToken();
        const jwks = jose.createRemoteJWKSet(
          new URL("https://www.googleapis.com/oauth2/v3/certs"),
        );
        const { payload } = await jose.jwtVerify(idToken, jwks, {
          issuer: "https://accounts.google.com",
          audience: Bun.env.GOOGLE_CLIENT_ID,
        });

        const googleId = typeof payload.sub === "string" ? payload.sub : "";
        if (googleId === "") {
          return status(400, "Invalid id_token");
        }

        let user = getUserByGoogleId(googleId);
        if (!user) {
          user = addUser({
            id: crypto.randomUUID(),
            googleId,
            createdAt: Date.now(),
          });
        }

        cookie.auth_token.set({
          value: await issueAuthToken(user.id),
          ...sessionCookie,
        });
        return redirect(frontendUrl);
      } catch (error) {
        console.error(error);
        return status(500, "Failed to process user authentication");
      }
    },
    { cookie: cookieSchema },
  )
  .post(
    "/api/auth/logout",
    ({ cookie }) => {
      cookie.auth_token.set({ value: "", ...sessionCookie, maxAge: 0 });
      return { message: "Logged out" };
    },
    { session: true, cookie: cookieSchema },
  );
