import { createHmac } from "node:crypto";
import * as jose from "jose";
import {
  GuestManagementTokenSchema,
  type GuestInstanceReference,
  type Instance,
} from "shared";
import { jwtSecret } from "./jwtSecret";

const GUEST_TOKEN_HEADER = "x-guest-token";
const GUEST_WEBSOCKET_PROTOCOL_PREFIX = "guest-token.";
const GUEST_TOKEN_AUDIENCE = "httpworkbench:guest-instance";
const GUEST_TOKEN_ISSUER = "httpworkbench";
const GUEST_TOKEN_KIND = "guest_instance";
const guestTokenSecret = createHmac("sha256", jwtSecret)
  .update(GUEST_TOKEN_AUDIENCE)
  .digest();

type GuestInstanceIdentity = Pick<Instance, "id" | "createdAt">;

export const issueGuestManagementToken = async (
  instance: GuestInstanceIdentity,
  expiresAt: number,
) =>
  await new jose.SignJWT({
    kind: GUEST_TOKEN_KIND,
    createdAt: instance.createdAt,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(GUEST_TOKEN_ISSUER)
    .setAudience(GUEST_TOKEN_AUDIENCE)
    .setSubject(instance.id)
    .setIssuedAt()
    .setExpirationTime(Math.ceil(expiresAt / 1000))
    .sign(guestTokenSecret);

export const authenticateGuestInstance = async (
  instance: GuestInstanceIdentity,
  token: string | undefined,
): Promise<boolean> => {
  if (
    token === undefined ||
    !GuestManagementTokenSchema.safeParse(token).success
  ) {
    return false;
  }
  try {
    const { payload } = await jose.jwtVerify(token, guestTokenSecret, {
      algorithms: ["HS256"],
      audience: GUEST_TOKEN_AUDIENCE,
      issuer: GUEST_TOKEN_ISSUER,
      subject: instance.id,
      typ: "JWT",
      requiredClaims: ["exp", "iat", "kind", "createdAt"],
    });
    return (
      payload.kind === GUEST_TOKEN_KIND &&
      payload.createdAt === instance.createdAt
    );
  } catch {
    return false;
  }
};

export const authenticateGuestInstanceReferences = async (
  references: GuestInstanceReference[],
  instances: GuestInstanceIdentity[],
): Promise<string[]> => {
  const uniqueIds = [...new Set(references.map(({ id }) => id))];
  const instancesById = new Map(
    instances.map((instance) => [instance.id, instance]),
  );
  const results = await Promise.all(
    references.map(async ({ id, token }) => {
      const instance = instancesById.get(id);
      return {
        id,
        authenticated:
          instance !== undefined &&
          (await authenticateGuestInstance(instance, token)),
      };
    }),
  );
  const authorizedIds = new Set(
    results.flatMap(({ id, authenticated }) => (authenticated ? [id] : [])),
  );
  return uniqueIds.filter((id) => authorizedIds.has(id));
};

export const readGuestManagementToken = (request: Request) =>
  request.headers.get(GUEST_TOKEN_HEADER) ?? undefined;

export const readGuestWebSocketProtocol = (
  request: Request,
): { protocol: string; token: string } | undefined => {
  const protocols = request.headers
    .get("sec-websocket-protocol")
    ?.split(",")
    .map((protocol) => protocol.trim());
  const protocol = protocols?.find((candidate) =>
    candidate.startsWith(GUEST_WEBSOCKET_PROTOCOL_PREFIX),
  );
  if (protocol === undefined) {
    return undefined;
  }
  const token = protocol.slice(GUEST_WEBSOCKET_PROTOCOL_PREFIX.length);
  if (!GuestManagementTokenSchema.safeParse(token).success) {
    return undefined;
  }
  return { protocol, token };
};
