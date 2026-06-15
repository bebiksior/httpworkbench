import { describe, expect, test } from "bun:test";
import {
  clampLogLimit,
  decodeLogsCursor,
  encodeLogsCursor,
  ensureStaticResponseWithinLimit,
  ensureValidStaticHttpRaw,
  normalizeStaticHttpRaw,
  validateStaticRaw,
} from "./utils";

describe("ensureValidStaticHttpRaw", () => {
  test("accepts a minimal valid HTTP response", () => {
    expect(ensureValidStaticHttpRaw("HTTP/1.1 200 OK\r\n\r\n")).toBeUndefined();
  });

  test("accepts an LF-delimited HTTP response", () => {
    expect(
      ensureValidStaticHttpRaw("HTTP/1.1 200 OK\n\nhello"),
    ).toBeUndefined();
  });

  test("rejects body-only content", () => {
    expect(ensureValidStaticHttpRaw("<script></script>")).toMatchObject({
      status: 400,
    });
  });

  test("rejects missing header/body separator", () => {
    expect(ensureValidStaticHttpRaw("HTTP/1.1 200 OK\r\n")).toMatchObject({
      status: 400,
    });
  });

  test("rejects invalid status line", () => {
    expect(ensureValidStaticHttpRaw("HTTP/1.1 OK\r\n\r\n")).toMatchObject({
      status: 400,
    });
  });
});

describe("normalizeStaticHttpRaw", () => {
  test("normalizes header line endings to CRLF and preserves the body", () => {
    expect(
      normalizeStaticHttpRaw(
        "HTTP/1.1 200 OK\nContent-Type: text/plain\n\nhello\nworld",
      ),
    ).toBe("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nhello\nworld");
  });
});

describe("ensureStaticResponseWithinLimit", () => {
  test("returns undefined when the response is below the limit", () => {
    expect(ensureStaticResponseWithinLimit("small response")).toBeUndefined();
  });

  test("returns a 413 error when the response exceeds the limit", () => {
    expect(
      ensureStaticResponseWithinLimit("a".repeat(11 * 1024 * 1024)),
    ).toMatchObject({ status: 413 });
  });
});

describe("validateStaticRaw", () => {
  test("returns the normalized raw for a valid response", () => {
    expect(validateStaticRaw("HTTP/1.1 200 OK\nA: b\n\nhi")).toEqual({
      ok: true,
      raw: "HTTP/1.1 200 OK\r\nA: b\r\n\r\nhi",
    });
  });

  test("returns the status and message for an invalid response", () => {
    const result = validateStaticRaw("not http");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("HTTP status line");
    }
  });
});

describe("clampLogLimit", () => {
  test("defaults to 50 when undefined", () => {
    expect(clampLogLimit(undefined)).toBe(50);
  });

  test("clamps into the 1..500 range", () => {
    expect(clampLogLimit(0)).toBe(1);
    expect(clampLogLimit(10)).toBe(10);
    expect(clampLogLimit(99999)).toBe(500);
  });
});

describe("log cursor codec", () => {
  test("round-trips a cursor through the opaque wire format", () => {
    const encoded = encodeLogsCursor({ seq: 42 });
    expect(typeof encoded).toBe("string");
    expect(decodeLogsCursor(encoded)).toEqual({ seq: 42 });
  });

  test("rejects malformed or out-of-domain cursors", () => {
    const b64 = (value: unknown) =>
      Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    expect(decodeLogsCursor("not-base64url-json")).toBeUndefined();
    expect(decodeLogsCursor(b64({ seq: -1 }))).toBeUndefined();
    expect(decodeLogsCursor(b64({ seq: 1.5 }))).toBeUndefined();
    expect(decodeLogsCursor(b64({ seq: "1" }))).toBeUndefined();
    expect(decodeLogsCursor(b64({ nope: 1 }))).toBeUndefined();
  });
});
