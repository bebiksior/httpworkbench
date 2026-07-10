import { describe, expect, test } from "bun:test";
import type { Instance } from "shared";

process.env.JWT_SECRET = "mcp-context-test-secret";

const { serializeInstance, serializeInstanceSummary } =
  await import("./context");

const instance: Instance = {
  id: "instance-1",
  ownerId: "owner-1",
  createdAt: 1,
  webhookIds: [],
  public: false,
  locked: false,
  raw: "HTTP/1.1 200 OK\r\n\r\nok",
};

const instanceSummary = {
  ...instance,
  logCount: 3,
};

describe("MCP instance serialization", () => {
  test("serializes static-only instance details", () => {
    const serialized = serializeInstance(instance);

    expect(serialized.raw).toBe(instance.raw);
    expect("kind" in serialized).toBe(false);
    expect("processors" in serialized).toBe(false);
  });

  test("omits response content and legacy fields from summaries", () => {
    const serialized = serializeInstanceSummary(instanceSummary);

    expect(serialized.id).toBe(instance.id);
    expect("raw" in serialized).toBe(false);
    expect("kind" in serialized).toBe(false);
    expect("processors" in serialized).toBe(false);
    expect(serialized.logCount).toBe(3);
  });
});
