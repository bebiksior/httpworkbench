import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Elysia } from "elysia";
import { instancePolicies } from "../../config";
import { closeDb, getDb, initDb } from "../../storage";
import { logs } from "../../storage/schema";

process.env.JWT_SECRET = "guest-instance-routes-test-secret";

const { guestInstancesRoutes } = await import("./guestInstances");

const app = new Elysia().use(guestInstancesRoutes);
const originalAllowGuest = instancePolicies.allowGuest;
let dataDir = "";
let clientId = "";

const call = (
  pathName: string,
  method: string,
  body?: unknown,
  token?: string,
) =>
  app.handle(
    new Request(`http://localhost${pathName}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-internal-real-ip": clientId,
        ...(token === undefined ? {} : { "x-guest-token": token }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

const createGuest = async (body = "created") => {
  const response = await call("/api/guest/instances", "POST", {
    raw: `HTTP/1.1 200 OK\nContent-Type: text/plain\n\n${body}`,
  });
  expect(response.status).toBe(201);
  return (await response.json()) as {
    instance: { id: string; raw: string; webhookIds: string[] };
    token: string;
  };
};

describe("guest instance routes", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-guest-route-"));
    clientId = crypto.randomUUID();
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

  test("returns a management token and requires it for reads and updates", async () => {
    const created = await createGuest();
    expect(created.token.split(".")).toHaveLength(3);
    expect(created.instance.raw).toBe(
      "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\ncreated",
    );
    expect(created.instance.webhookIds).toEqual([]);

    const anonymous = await call(
      `/api/guest/instances/${created.instance.id}`,
      "GET",
    );
    expect(anonymous.status).toBe(404);
    const wrongToken = await call(
      `/api/guest/instances/${created.instance.id}`,
      "GET",
      undefined,
      "header.payload.signature",
    );
    expect(wrongToken.status).toBe(404);

    const detail = await call(
      `/api/guest/instances/${created.instance.id}`,
      "GET",
      undefined,
      created.token,
    );
    expect(detail.status).toBe(200);

    const updated = await call(
      `/api/guest/instances/${created.instance.id}`,
      "PUT",
      { raw: "HTTP/1.1 204 No Content\n\n" },
      created.token,
    );
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as { raw: string }).raw).toBe(
      "HTTP/1.1 204 No Content\r\n\r\n",
    );
  });

  test("uses strict static-only guest payloads", async () => {
    const withWebhook = await call("/api/guest/instances", "POST", {
      raw: "HTTP/1.1 200 OK\n\nok",
      webhookIds: ["not-allowed"],
    });
    expect(withWebhook.status).toBe(422);

    const dynamic = await call("/api/guest/instances", "POST", {
      kind: "dynamic",
      processors: [],
    });
    expect(dynamic.status).toBeGreaterThanOrEqual(400);

    const tooLarge = await call("/api/guest/instances", "POST", {
      raw: `HTTP/1.1 200 OK\n\n${"x".repeat(1024 * 1024)}`,
    });
    expect(tooLarge.status).toBeGreaterThanOrEqual(400);
  });

  test("rate limits guest creation by trusted client address", async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await call("/api/guest/instances", "POST", {
        raw: `HTTP/1.1 200 OK\n\n${index}`,
      });
      expect(response.status).toBe(201);
    }
    const blocked = await call("/api/guest/instances", "POST", {
      raw: "HTTP/1.1 200 OK\n\nblocked",
    });
    expect(blocked.status).toBe(429);
  });

  test("bounds token-gated guest API traffic per client", async () => {
    const created = await createGuest();
    for (let index = 0; index < 299; index += 1) {
      const response = await call(
        `/api/guest/instances/${created.instance.id}`,
        "GET",
        undefined,
        created.token,
      );
      expect(response.status).toBe(200);
    }
    const blocked = await call(
      `/api/guest/instances/${created.instance.id}`,
      "GET",
      undefined,
      created.token,
    );
    expect(blocked.status).toBe(429);
  });

  test("loads only correctly tokened guest references in one batch", async () => {
    const first = await createGuest("first");
    const second = await createGuest("second");
    getDb()
      .insert(logs)
      .values({
        id: "guest-summary-log",
        instanceId: second.instance.id,
        type: "dns",
        timestamp: 1,
        address: "127.0.0.1",
        raw: "example.com A",
      })
      .run();

    const response = await call("/api/guest/instances/list", "POST", {
      instances: [
        { id: second.instance.id, token: second.token },
        { id: first.instance.id, token: second.token },
        { id: first.instance.id, token: first.token },
      ],
    });

    expect(response.status).toBe(200);
    const summaries = (await response.json()) as Array<Record<string, unknown>>;
    expect(summaries.map(({ id }) => id)).toEqual([
      second.instance.id,
      first.instance.id,
    ]);
    expect(summaries.map(({ logCount }) => logCount)).toEqual([1, 0]);
    expect(summaries.every((summary) => !("raw" in summary))).toBe(true);
    expect(summaries.every((summary) => !("webhookIds" in summary))).toBe(true);
  });

  test("pages recent logs backward behind the management token", async () => {
    const created = await createGuest();
    getDb()
      .insert(logs)
      .values(
        Array.from({ length: 105 }, (_, index) => ({
          id: `log-${index + 1}`,
          instanceId: created.instance.id,
          type: "http" as const,
          timestamp: index + 1,
          address: "127.0.0.1",
          raw: `GET /${index + 1} HTTP/1.1`,
        })),
      )
      .run();

    const detailResponse = await call(
      `/api/guest/instances/${created.instance.id}`,
      "GET",
      undefined,
      created.token,
    );
    const detail = (await detailResponse.json()) as {
      logs: Array<{ id: string }>;
      olderLogsCursor: string;
    };
    expect(detail.logs[0]?.id).toBe("log-6");
    expect(detail.olderLogsCursor).toBeString();

    const olderResponse = await call(
      `/api/guest/instances/${created.instance.id}/logs/recent?limit=100&cursor=${detail.olderLogsCursor}`,
      "GET",
      undefined,
      created.token,
    );
    const older = (await olderResponse.json()) as {
      logs: Array<{ id: string }>;
      olderLogsCursor?: string;
    };
    expect(older.logs.map(({ id }) => id)).toEqual([
      "log-1",
      "log-2",
      "log-3",
      "log-4",
      "log-5",
    ]);
    expect(older.olderLogsCursor).toBeUndefined();
  });
});
