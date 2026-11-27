import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const serverSecret = Bun.env.JWT_SECRET;

if (serverSecret === undefined || serverSecret === "") {
  throw new Error("JWT_SECRET must be set");
}

// A separate HKDF label keeps this key independent from JWT signing and
// API key hashing, which use the same secret.
const key = Buffer.from(
  hkdfSync(
    "sha256",
    serverSecret,
    Buffer.alloc(0),
    "httpworkbench stored credentials v1",
    32,
  ),
);

const version = "v1";

export const sealSecret = (plaintext: string, context: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return `${version}.${iv.toString("base64url")}.${ciphertext.toString("base64url")}`;
};

export const openSecret = (
  sealed: string,
  context: string,
): string | undefined => {
  const [prefix, ivText, payloadText] = sealed.split(".");
  if (prefix !== version || ivText === undefined || payloadText === undefined) {
    return undefined;
  }
  try {
    const payload = Buffer.from(payloadText, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivText, "base64url"),
    );
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(payload.subarray(payload.length - 16));
    return Buffer.concat([
      decipher.update(payload.subarray(0, payload.length - 16)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
};
