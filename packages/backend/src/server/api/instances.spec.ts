import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Elysia } from "elysia";
import { addUser, addWebhook, closeDb, getDb, initDb } from "../../storage";
import { logs } from "../../storage/schema";

process.env.JWT_SECRET = "instance-routes-test-secret";

const { issueAuthToken } = await import("../auth");
const { instancesRoutes } = await import("./instances");
const app = new Elysia().use(instancesRoutes);
let dataDir = "";

const call = async (
  pathName: string,
  method: string,
  userId: string,
  body: unknown,
) => {
  const token = await issueAuthToken(userId);
  return app.handle(
    new Request(`http://localhost${pathName}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
};

describe("authenticated instance routes", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-route-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
    addUser({ id: "owner-1", googleId: "google-1", createdAt: 1 });
    addUser({ id: "owner-2", googleId: "google-2", createdAt: 1 });
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("creates and updates a static-only instance", async () => {
    const createdResponse = await call("/api/instances", "POST", "owner-1", {
      raw: "HTTP/1.1 200 OK\n\ncreated",
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      id: string;
      raw: string;
      kind?: unknown;
    };
    expect(created.raw).toBe("HTTP/1.1 200 OK\r\n\r\ncreated");
    expect(created.kind).toBeUndefined();

    const updatedResponse = await call(
      `/api/instances/${created.id}`,
      "PUT",
      "owner-1",
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

  test("returns domain errors for duplicate webhooks and wrong owners", async () => {
    addWebhook({
      id: "webhook-1",
      ownerId: "owner-1",
      name: "Alerts",
      url: "https://discord.com/api/webhooks/123/token",
      createdAt: 1,
    });
    const duplicateResponse = await call("/api/instances", "POST", "owner-1", {
      raw: "HTTP/1.1 200 OK\n\nok",
      webhookIds: ["webhook-1", "webhook-1"],
    });
    expect(duplicateResponse.status).toBe(400);
    expect(await duplicateResponse.json()).toEqual({
      error: "Invalid webhook selection",
    });

    const ownerTwoResponse = await call("/api/instances", "POST", "owner-2", {
      raw: "HTTP/1.1 200 OK\n\nowner two",
    });
    const ownerTwo = (await ownerTwoResponse.json()) as { id: string };
    const forbiddenResponse = await call(
      `/api/instances/${ownerTwo.id}`,
      "PUT",
      "owner-1",
      { raw: "HTTP/1.1 200 OK\n\nforbidden" },
    );
    expect(forbiddenResponse.status).toBe(403);
    expect(await forbiddenResponse.json()).toEqual({ error: "Forbidden" });
  });

  test("lists lightweight instance summaries", async () => {
    const createdResponse = await call("/api/instances", "POST", "owner-1", {
      raw: "HTTP/1.1 200 OK\n\nlarge response body",
    });
    const created = (await createdResponse.json()) as { id: string };
    const token = await issueAuthToken("owner-1");

    const response = await app.handle(
      new Request("http://localhost/api/instances", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: created.id,
        ownerId: "owner-1",
        createdAt: expect.any(Number),
        public: false,
        locked: false,
      },
    ]);
  });

  test("bounds embedded detail logs to the 100 most recent entries", async () => {
    const createdResponse = await call("/api/instances", "POST", "owner-1", {
      raw: "HTTP/1.1 200 OK\n\nok",
    });
    const created = (await createdResponse.json()) as { id: string };
    getDb()
      .insert(logs)
      .values(
        Array.from({ length: 105 }, (_, index) => ({
          id: `log-${index + 1}`,
          instanceId: created.id,
          type: "http" as const,
          timestamp: index + 1,
          address: "127.0.0.1",
          raw: `GET /${index + 1} HTTP/1.1`,
        })),
      )
      .run();
    const token = await issueAuthToken("owner-1");

    const response = await app.handle(
      new Request(`http://localhost/api/instances/${created.id}`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const detail = (await response.json()) as {
      logs: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(detail.logs).toHaveLength(100);
    expect(detail.logs[0]?.id).toBe("log-6");
    expect(detail.logs.at(-1)?.id).toBe("log-105");
  });
});
