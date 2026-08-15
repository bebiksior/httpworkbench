import {
  afterAll,
  afterEach,
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

process.env.JWT_SECRET = "ai-routes-test-secret";
process.env.FRONTEND_URL = "http://localhost";
process.env.GOOGLE_CLIENT_ID ??= "test-client";
process.env.GOOGLE_CLIENT_SECRET ??= "test-secret";

const originalFetch = globalThis.fetch;
const upstreamRequests: Array<{
  url: string;
  init?: Parameters<typeof fetch>[1];
}> = [];

globalThis.fetch = mock(
  (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = input instanceof Request ? input.url : input.toString();
    upstreamRequests.push({ url, init });
    if (url === "https://auth.x.ai/oauth2/device/code") {
      return Promise.resolve(
        Response.json({
          device_code: "device-1",
          user_code: "CODE-1",
          verification_uri: "https://auth.x.ai/device",
          expires_in: 300,
          interval: 5,
        }),
      );
    }
    if (url === "https://chatgpt.com/backend-api/codex/responses") {
      return Promise.resolve(
        new Response("data: done\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
      );
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  },
) as unknown as typeof fetch;

const { issueAuthToken } = await import("../auth");
const { aiRoutes } = await import("./ai");
const app = new Elysia().use(aiRoutes);
let dataDir = "";
let token = "";

const post = (
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  app.handle(
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        origin: "http://localhost",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );

describe("AI routes", () => {
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(async () => {
    upstreamRequests.length = 0;
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-ai-route-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") throw result.error;
    addUser({ id: "owner-1", googleId: "google-1", createdAt: 1 });
    token = await issueAuthToken("owner-1");
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("starts device authorization only for an allowed browser origin", async () => {
    const response = await post("/api/ai/oauth/device", { provider: "xai" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "xai",
      deviceCode: "device-1",
      userCode: "CODE-1",
    });
    expect(upstreamRequests).toHaveLength(1);

    const rejected = await post(
      "/api/ai/oauth/device",
      { provider: "xai" },
      { origin: "https://attacker.example" },
    );
    expect(rejected.status).toBe(403);
    expect(upstreamRequests).toHaveLength(1);
  });

  test("streams ChatGPT responses through the authenticated adapter", async () => {
    const response = await post(
      "/api/ai/chatgpt/responses",
      {
        model: "gpt-5.6-sol",
        input: [],
        store: true,
        max_output_tokens: 1024,
      },
      {
        "x-ai-provider-token": "provider-token",
        "x-ai-provider-account-id": "account-1",
      },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("data: done\n\n");
    const upstream = upstreamRequests[0];
    const body = JSON.parse(String(upstream?.init?.body));
    expect(body).toMatchObject({ store: false, stream: true });
    expect(body.max_output_tokens).toBeUndefined();
    const headers = new Headers(upstream?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer provider-token");
    expect(headers.get("chatgpt-account-id")).toBe("account-1");
  });
});
