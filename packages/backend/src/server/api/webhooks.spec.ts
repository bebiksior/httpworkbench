import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Elysia } from "elysia";
import { addUser, closeDb, initDb } from "../../storage";

process.env.JWT_SECRET = "webhook-routes-test-secret";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.GOOGLE_CLIENT_ID ??= "test-client";
process.env.GOOGLE_CLIENT_SECRET ??= "test-secret";

const { issueAuthToken } = await import("../auth");
const { webhooksRoutes } = await import("./webhooks");
const app = new Elysia().use(webhooksRoutes);
const originalFetch = globalThis.fetch;
let dataDir = "";

describe("webhook routes", () => {
  beforeAll(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    ) as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-webhook-route-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
    addUser({ id: "owner-1", googleId: "google-1", createdAt: 1 });
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("rate limits outbound webhook tests per user", async () => {
    const token = await issueAuthToken("owner-1");
    const send = () =>
      app.handle(
        new Request("http://localhost/api/webhooks/test", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            url: "https://discord.com/api/webhooks/123/token",
          }),
        }),
      );

    for (let index = 0; index < 5; index += 1) {
      expect((await send()).status).toBe(204);
    }
    expect((await send()).status).toBe(429);
  });
});
