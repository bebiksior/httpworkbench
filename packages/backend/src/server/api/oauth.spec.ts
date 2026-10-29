import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Elysia } from "elysia";
import { closeDb, initDb, setLocalPassword } from "../../storage";

process.env.AUTH_MODE = "password";
process.env.JWT_SECRET = "oauth-routes-test-secret";
process.env.FRONTEND_URL = "https://workbench.example";

const { oauthRoutes } = await import("./oauth");
const { userRoutes } = await import("./user");

const password = "correct horse battery staple";
const passwordHash = await Bun.password.hash(password);
let dataDir = "";
const app = new Elysia().use(oauthRoutes).use(userRoutes);

const call = (pathname: string, init?: globalThis.RequestInit) =>
  app.handle(new Request(`https://workbench.example${pathname}`, init));

const signIn = (body: { username: string; password: string }, ip = "1.1.1.1") =>
  call("/api/auth/password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-real-ip": ip },
    body: JSON.stringify(body),
  });

const sessionCookie = (response: Response) =>
  response.headers.get("set-cookie")?.split(";")[0] ?? "";

describe("password sign-in", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-oauth-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
    setLocalPassword("admin", passwordHash);
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("issues a session cookie for valid credentials", async () => {
    const response = await signIn({ username: " Admin ", password });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");

    const user = await call("/api/user", {
      headers: { cookie: sessionCookie(response) },
    });
    expect(user.status).toBe(200);
  });

  test("rejects wrong passwords and unknown users alike", async () => {
    const wrong = await signIn(
      { username: "admin", password: "nope" },
      "2.2.2.2",
    );
    const unknown = await signIn({ username: "ghost", password }, "2.2.2.2");
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  test("rejects cross-site form login while allowing same-origin JSON login", async () => {
    for (const headers of [
      { origin: "https://untrusted.example", "sec-fetch-site": "same-origin" },
      { origin: "https://workbench.example", "sec-fetch-site": "cross-site" },
    ]) {
      const response = await call("/api/auth/password", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-internal-real-ip": "5.5.5.5",
          ...headers,
        },
        body: new URLSearchParams({ username: "admin", password }).toString(),
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    }

    const response = await call("/api/auth/password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-real-ip": "5.5.5.5",
        origin: "https://workbench.example",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ username: "admin", password }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  test("revokes existing sessions when the password is reset", async () => {
    const session = sessionCookie(
      await signIn({ username: "admin", password }, "3.3.3.3"),
    );
    setLocalPassword("admin", passwordHash);

    const user = await call("/api/user", { headers: { cookie: session } });
    expect(user.status).toBe(401);
  });

  test("rate limits attempts per client", async () => {
    const attempts = [];
    for (let i = 0; i < 6; i += 1) {
      attempts.push(
        (await signIn({ username: "admin", password: "nope" }, "4.4.4.4"))
          .status,
      );
    }
    expect(attempts).toEqual([401, 401, 401, 401, 401, 429]);
  });

  test("disables Google sign-in", async () => {
    expect((await call("/api/auth/google")).status).toBe(404);
  });
});
