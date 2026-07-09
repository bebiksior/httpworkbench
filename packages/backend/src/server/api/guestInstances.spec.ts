import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Elysia } from "elysia";
import { instancePolicies } from "../../config";
import { closeDb, initDb } from "../../storage";
import { guestInstancesRoutes } from "./guestInstances";

const app = new Elysia().use(guestInstancesRoutes);
const originalAllowGuest = instancePolicies.allowGuest;
let dataDir = "";

const call = (pathName: string, method: string, body: unknown) =>
  app.handle(
    new Request(`http://localhost${pathName}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("guest instance routes", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-guest-route-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
    instancePolicies.allowGuest = true;
  });

  afterEach(() => {
    instancePolicies.allowGuest = originalAllowGuest;
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("creates and updates static-only responses without exposing kind", async () => {
    const createdResponse = await call("/api/guest/instances", "POST", {
      raw: "HTTP/1.1 200 OK\nContent-Type: text/plain\n\ncreated",
      webhookIds: ["guests-cannot-select-webhooks"],
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      id: string;
      raw: string;
      webhookIds: string[];
      kind?: unknown;
    };
    expect(created.raw).toBe(
      "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\ncreated",
    );
    expect(created.webhookIds).toEqual([]);
    expect(created.kind).toBeUndefined();

    const updatedResponse = await call(
      `/api/guest/instances/${created.id}`,
      "PUT",
      { raw: "HTTP/1.1 204 No Content\n\n" },
    );
    expect(updatedResponse.status).toBe(200);
    const updated = (await updatedResponse.json()) as {
      raw: string;
      kind?: unknown;
    };
    expect(updated.raw).toBe("HTTP/1.1 204 No Content\r\n\r\n");
    expect(updated.kind).toBeUndefined();
  });

  test("rejects legacy dynamic create and update payloads", async () => {
    const createResponse = await call("/api/guest/instances", "POST", {
      kind: "dynamic",
      processors: [],
    });
    expect(createResponse.status).toBeGreaterThanOrEqual(400);

    const validResponse = await call("/api/guest/instances", "POST", {
      raw: "HTTP/1.1 200 OK\n\nok",
    });
    const valid = (await validResponse.json()) as { id: string };
    const updateResponse = await call(
      `/api/guest/instances/${valid.id}`,
      "PUT",
      { kind: "dynamic", processors: [] },
    );
    expect(updateResponse.status).toBeGreaterThanOrEqual(400);
  });
});
