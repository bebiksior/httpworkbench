import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { INSTANCE_RAW_LIMIT_BYTES } from "shared";
import { addUser, closeDb, initDb } from "../storage";

process.env.JWT_SECRET = "api-server-test-secret";
process.env.GOOGLE_CLIENT_ID = "api-server-test-client";
process.env.GOOGLE_CLIENT_SECRET = "api-server-test-client-secret";
process.env.FRONTEND_URL = "http://localhost:5173";

const { issueAuthToken } = await import("./auth");
const { buildApiServer } = await import("./index");

let dataDir = "";
let apiServer: ReturnType<typeof buildApiServer> | undefined;

describe("API server transport limits", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-api-server-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
    addUser({ id: "owner-1", googleId: "google-1", createdAt: 1 });
  });

  afterEach(() => {
    apiServer?.stop(true);
    apiServer = undefined;
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("accepts a maximally sized raw response after JSON escaping", async () => {
    apiServer = buildApiServer(0);
    const token = await issueAuthToken("owner-1");
    const prefix = "HTTP/1.1 200 OK\r\n\r\n";
    const raw = `${prefix}${"\\".repeat(
      INSTANCE_RAW_LIMIT_BYTES - prefix.length,
    )}`;
    const body = JSON.stringify({ raw });
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(
      12 * 1024 * 1024,
    );

    const response = await fetch(
      `http://127.0.0.1:${apiServer.server?.port}/api/instances`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body,
      },
    );

    expect(response.status).toBe(201);
    await response.body?.cancel();
  }, 30_000);
});
