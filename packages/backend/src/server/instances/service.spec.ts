import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { instancePolicies } from "../../config";
import { addWebhook, closeDb, initDb } from "../../storage";
import { createInstance, replaceInstance } from "./service";

const validRaw = "HTTP/1.1 200 OK\nContent-Type: text/plain\n\nhello";
const originalInstanceLimit = instancePolicies.maxInstancesPerOwner;
let dataDir = "";

const addOwnedWebhook = (id: string, ownerId: string) =>
  addWebhook({
    id,
    ownerId,
    name: id,
    url: "https://discord.com/api/webhooks/123/token",
    createdAt: 1,
  });

describe("instance service", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-service-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
    instancePolicies.maxInstancesPerOwner = undefined;
  });

  afterEach(() => {
    instancePolicies.maxInstancesPerOwner = originalInstanceLimit;
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("normalizes raw responses and persists owned webhooks", () => {
    addOwnedWebhook("webhook-1", "owner-1");

    const result = createInstance({
      ownerId: "owner-1",
      raw: validRaw,
      webhookIds: ["webhook-1"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.raw).toBe(
      "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nhello",
    );
    expect(result.value.webhookIds).toEqual(["webhook-1"]);
    expect("kind" in result.value).toBe(false);
  });

  test("rejects webhooks owned by another user and duplicate ids", () => {
    addOwnedWebhook("owned", "owner-1");
    addOwnedWebhook("foreign", "owner-2");

    const foreign = createInstance({
      ownerId: "owner-1",
      raw: validRaw,
      webhookIds: ["foreign"],
    });
    expect(foreign).toEqual({
      ok: false,
      error: {
        code: "invalid_webhooks",
        message: "Invalid webhook selection",
        status: 400,
      },
    });

    const duplicate = createInstance({
      ownerId: "owner-1",
      raw: validRaw,
      webhookIds: ["owned", "owned"],
    });
    expect(duplicate).toEqual({
      ok: false,
      error: {
        code: "invalid_webhooks",
        message: "Invalid webhook selection",
        status: 400,
      },
    });
  });

  test("enforces the active instance quota without hydrating instances", () => {
    instancePolicies.maxInstancesPerOwner = 1;
    expect(createInstance({ ownerId: "owner-1", raw: validRaw }).ok).toBe(true);

    expect(createInstance({ ownerId: "owner-1", raw: validRaw })).toEqual({
      ok: false,
      error: {
        code: "instance_limit",
        message: "Instance limit reached",
        status: 403,
      },
    });
  });

  test("returns a typed forbidden result for wrong-owner updates", () => {
    const created = createInstance({ ownerId: "owner-1", raw: validRaw });
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    expect(
      replaceInstance({
        instanceId: created.value.id,
        ownerId: "owner-2",
        raw: "HTTP/1.1 204 No Content\n\n",
      }),
    ).toEqual({
      ok: false,
      error: { code: "forbidden", message: "Forbidden", status: 403 },
    });
  });
});
