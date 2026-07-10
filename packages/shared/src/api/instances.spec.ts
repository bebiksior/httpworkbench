import { describe, expect, test } from "vitest";
import {
  CreateInstanceSchema,
  CreateGuestInstanceSchema,
  GuestInstanceSummariesRequestSchema,
  InstanceSchema,
  InstancesResponseSchema,
  UpdateInstanceSchema,
} from "..";

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
    expect(
      CreateInstanceSchema.safeParse({
        raw: instance.raw,
        kind: "dynamic",
        processors: [],
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

  test("strictly validates guest management inputs", () => {
    expect(CreateGuestInstanceSchema.parse({ raw: instance.raw })).toEqual({
      raw: instance.raw,
    });
    expect(
      CreateGuestInstanceSchema.safeParse({
        raw: instance.raw,
        webhookIds: ["webhook-1"],
      }).success,
    ).toBe(false);
    expect(
      GuestInstanceSummariesRequestSchema.safeParse({
        instances: [{ id: "abcd1234", token: "a".repeat(64) }],
      }).success,
    ).toBe(true);
    expect(
      GuestInstanceSummariesRequestSchema.safeParse({
        instances: [{ id: "not-an-id", token: "secret" }],
      }).success,
    ).toBe(false);
  });

  test("uses lightweight instance summaries for list responses", () => {
    const [summary] = InstancesResponseSchema.parse([instance]);
    if (summary === undefined) {
      throw new Error("Expected an instance summary");
    }

    expect(summary).toEqual({
      id: instance.id,
      ownerId: instance.ownerId,
      createdAt: instance.createdAt,
      public: false,
      locked: false,
    });
    expect("raw" in summary).toBe(false);
    expect("webhookIds" in summary).toBe(false);
  });
});
