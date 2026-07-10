import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  GUEST_MANAGEMENT_TOKEN_PATTERN,
  type GuestInstanceReference,
} from "shared";
import {
  getActiveGuestCredentialHash,
  getActiveGuestCredentialHashes,
} from "../storage";

const GUEST_TOKEN_HEADER = "x-guest-token";
const GUEST_WEBSOCKET_PROTOCOL_PREFIX = "guest-token.";

const hashGuestManagementToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const tokenHashMatches = (token: string, expectedHash: string): boolean => {
  if (!GUEST_MANAGEMENT_TOKEN_PATTERN.test(token)) {
    return false;
  }
  const actual = Buffer.from(hashGuestManagementToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const createGuestManagementCredential = () => {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashGuestManagementToken(token) };
};

export const authenticateGuestInstance = (
  instanceId: string,
  token: string | undefined,
): boolean => {
  if (token === undefined) {
    return false;
  }
  const expectedHash = getActiveGuestCredentialHash(instanceId);
  return expectedHash !== undefined && tokenHashMatches(token, expectedHash);
};

export const authenticateGuestInstanceReferences = (
  references: GuestInstanceReference[],
): string[] => {
  const uniqueIds = [...new Set(references.map(({ id }) => id))];
  const expectedHashes = getActiveGuestCredentialHashes(uniqueIds);
  const authorizedIds = new Set<string>();
  for (const { id, token } of references) {
    const expectedHash = expectedHashes.get(id);
    if (expectedHash !== undefined && tokenHashMatches(token, expectedHash)) {
      authorizedIds.add(id);
    }
  }
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
  return GUEST_MANAGEMENT_TOKEN_PATTERN.test(token)
    ? { protocol, token }
    : undefined;
};
