import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  ensureStaticResponseWithinLimit,
  ensureValidStaticHttpRaw,
  normalizeStaticHttpRaw,
  parseJsonRequest,
} from "./utils";

describe("ensureValidStaticHttpRaw", () => {
  test("accepts a minimal valid HTTP response", () => {
    expect(ensureValidStaticHttpRaw("HTTP/1.1 200 OK\r\n\r\n")).toEqual({
      kind: "ok",
    });
  });

  test("accepts an LF-delimited HTTP response", () => {
    expect(ensureValidStaticHttpRaw("HTTP/1.1 200 OK\n\nhello")).toEqual({
      kind: "ok",
    });
  });

  test("rejects body-only content", () => {
    const r = ensureValidStaticHttpRaw("<script></script>");
    expect(r.kind).toBe("error");
  });

  test("rejects missing header/body separator", () => {
    const r = ensureValidStaticHttpRaw("HTTP/1.1 200 OK\r\n");
    expect(r.kind).toBe("error");
  });

  test("rejects invalid status line", () => {
    const r = ensureValidStaticHttpRaw("HTTP/1.1 OK\r\n\r\n");
    expect(r.kind).toBe("error");
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
  test("returns ok when the response is below the limit", () => {
    expect(ensureStaticResponseWithinLimit("small response")).toEqual({
      kind: "ok",
    });
  });

  test("returns a 413 response when the response exceeds the limit", async () => {
    const result = ensureStaticResponseWithinLimit(
      "a".repeat(11 * 1024 * 1024),
    );

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.response.status).toBe(413);
    }
  });
});

describe("parseJsonRequest", () => {
  test("returns an error for invalid json", async () => {
    const result = await parseJsonRequest(
      new Request("http://example.test", {
        method: "POST",
        body: "{",
      }),
      z.object({ name: z.string() }),
    );

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({
        error: "Invalid JSON",
      });
    }
  });

  test("returns an error for schema-invalid json", async () => {
    const result = await parseJsonRequest(
      new Request("http://example.test", {
        method: "POST",
        body: JSON.stringify({ count: 1 }),
      }),
      z.object({ name: z.string() }),
    );

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({
        error: "Invalid body",
      });
    }
  });

  test("returns parsed data for valid json", async () => {
    const result = await parseJsonRequest(
      new Request("http://example.test", {
        method: "POST",
        body: JSON.stringify({ name: "demo" }),
      }),
      z.object({ name: z.string() }),
    );

    expect(result).toEqual({
      kind: "ok",
      data: { name: "demo" },
    });
  });
});
