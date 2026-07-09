import { describe, expect, test } from "vitest";
import { CreateInstanceSchema, InstanceSchema, UpdateInstanceSchema } from "..";

const instance = {
  id: "instance-1",
  ownerId: "user-1",
  createdAt: 1,
  webhookIds: [],
  raw: "HTTP/1.1 200 OK\r\n\r\nok",
};

describe("static-only instance contracts", () => {
  test("requires raw instance content", () => {
    expect(InstanceSchema.safeParse(instance).success).toBe(true);
    expect(
      InstanceSchema.safeParse({ ...instance, raw: undefined }).success,
    ).toBe(false);
  });

  test("accepts static-only create and update payloads", () => {
    const payload = { raw: instance.raw, webhookIds: ["webhook-1"] };
    expect(CreateInstanceSchema.parse(payload)).toEqual(payload);
    expect(UpdateInstanceSchema.parse(payload)).toEqual(payload);
  });

  test("rejects legacy dynamic payloads and omits legacy response fields", () => {
    expect(
      CreateInstanceSchema.safeParse({
        kind: "dynamic",
        processors: [{ name: "handler", code: "return response" }],
      }).success,
    ).toBe(false);

    const parsed = InstanceSchema.parse({
      ...instance,
      kind: "static",
      processors: [],
    });
    expect(parsed).toEqual({ ...instance, public: false, locked: false });
    expect("kind" in parsed).toBe(false);
    expect("processors" in parsed).toBe(false);
  });
});
