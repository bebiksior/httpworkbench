import { Google, generateCodeVerifier, generateState } from "arctic";
import * as jose from "jose";
import { addUser, getUserByGoogleId } from "../../storage";
import { issueAuthToken, withAuth } from "../auth";

const googleClientId = Bun.env.GOOGLE_CLIENT_ID;
const googleClientSecret = Bun.env.GOOGLE_CLIENT_SECRET;
const frontendUrl = Bun.env.FRONTEND_URL;

if (
  googleClientId === undefined ||
  googleClientId === "" ||
  googleClientSecret === undefined ||
  googleClientSecret === "" ||
  frontendUrl === undefined ||
  frontendUrl === ""
) {
  throw new Error(
    "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and FRONTEND_URL must be set",
  );
}

const google = new Google(
  googleClientId,
  googleClientSecret,
  `${frontendUrl}/api/auth/google/callback`,
);

const isSecure = frontendUrl.startsWith("https://");

export const OAUTH_ROUTES = {
  "/api/auth/google": {
    GET: async () => {
      const state = generateState();
      const codeVerifier = generateCodeVerifier();

      const authUrl = google.createAuthorizationURL(state, codeVerifier, [
        "openid",
        "email",
        "profile",
      ]);

      const response = new Response(null, {
        status: 302,
        headers: {
          Location: authUrl.toString(),
        },
      });

      response.headers.set(
        "Set-Cookie",
        `oauth_state=${state}; HttpOnly${isSecure ? "; Secure" : ""}; Path=/; Max-Age=300`,
      );
      response.headers.append(
        "Set-Cookie",
        `oauth_code_verifier=${codeVerifier}; HttpOnly${isSecure ? "; Secure" : ""}; Path=/; Max-Age=300`,
      );

      return response;
    },
  },
  "/api/auth/google/callback": {
    GET: async (_req: Request) => {
      try {
        const url = new URL(_req.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (code === null || code === "" || state === null || state === "") {
          return new Response("Missing code/state", { status: 400 });
        }

        const cookieHeader = _req.headers.get("cookie") ?? "";
        const cookies = new Bun.CookieMap(cookieHeader);

        if (cookies.get("oauth_state") !== state) {
          return new Response("Invalid state", { status: 400 });
        }

        const codeVerifier = cookies.get("oauth_code_verifier") ?? "";
        if (codeVerifier === undefined || codeVerifier === "") {
          return new Response("Missing code verifier", { status: 400 });
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
          return new Response("Invalid id_token", { status: 400 });
        }

        let user = await getUserByGoogleId(googleId);
        if (!user) {
          user = await addUser({
            id: crypto.randomUUID(),
            googleId,
            createdAt: Date.now(),
          });
        }

        const appToken = await issueAuthToken(user.id);

        const response = new Response(undefined, {
          status: 302,
          headers: [
            ["Location", frontendUrl],
            [
              "Set-Cookie",
              `auth_token=${appToken}; HttpOnly${isSecure ? "; Secure" : ""}; SameSite=Lax; Path=/; Max-Age=2592000`,
            ],
          ],
        });

        return response;
      } catch (error) {
        console.error(error);
        return new Response("Failed to process user authentication", {
          status: 500,
        });
      }
    },
  },
  "/api/auth/logout": {
    POST: withAuth(async (_req, _user) => {
      const response = new Response(null, {
        status: 200,
      });
      response.headers.set(
        "Set-Cookie",
        `auth_token=; HttpOnly${isSecure ? "; Secure" : ""}; SameSite=Lax; Path=/; Max-Age=0`,
      );
      return response;
    }),
  },
};
