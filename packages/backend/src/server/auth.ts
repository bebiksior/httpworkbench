import type { BunRequest } from "bun";
import * as jose from "jose";
import type { User } from "shared";
import { getUserById, toPublicUser } from "../storage";

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

type AuthSuccess = {
  kind: "ok";
  user: User;
};

type AuthError = {
  kind: "error";
  status: number;
};

export const authenticateRequest = async (
  req: Request,
): Promise<AuthSuccess | AuthError> => {
  const authHeader = req.headers.get("authorization");
  let token = authHeader !== null ? extractBearer(authHeader) : undefined;

  if (token === undefined) {
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader !== null) {
      const cookies = new Bun.CookieMap(cookieHeader);
      const cookieToken = cookies.get("auth_token");
      token = cookieToken !== null ? cookieToken : undefined;
    }
  }

  if (token === undefined) {
    return { kind: "error", status: 401 };
  }

  let sub: string | undefined;
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    sub = typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return { kind: "error", status: 401 };
  }

  if (sub === undefined) {
    return { kind: "error", status: 401 };
  }

  const userRecord = await getUserById(sub);
  if (userRecord === undefined) {
    return { kind: "error", status: 401 };
  }

  return { kind: "ok", user: toPublicUser(userRecord) };
};

export const withAuth = <T extends string>(
  handler: (req: BunRequest<T>, user: User) => Promise<Response> | Response,
) => {
  return async (req: BunRequest<T>) => {
    const auth = await authenticateRequest(req);
    if (auth.kind === "error") {
      return new Response("Unauthorized", { status: auth.status });
    }

    return handler(req, auth.user);
  };
};
