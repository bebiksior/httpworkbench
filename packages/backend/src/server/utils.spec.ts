import { describe, expect, test } from "vitest";
import { z } from "zod";
import { ensureStaticResponseWithinLimit, parseJsonRequest } from "./utils";

describe("ensureStaticResponseWithinLimit", () => {
  test("returns ok when the response is below the limit", () => {
    expect(ensureStaticResponseWithinLimit("small response")).toEqual({
      kind: "ok",
    });
  });

  test("returns a 413 response when the response exceeds the limit", async () => {
    const result = ensureStaticResponseWithinLimit("a".repeat(11 * 1024 * 1024));

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
