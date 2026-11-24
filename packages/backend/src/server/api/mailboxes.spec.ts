import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Elysia } from "elysia";

process.env.JWT_SECRET = "mailbox-routes-test-secret";
process.env.SMTP_ENABLED = "true";

const {
  addMailbox,
  addMailMessage,
  addUser,
  closeDb,
  hasActiveMailbox,
  initDb,
} = await import("../../storage");

const { issueAuthToken } = await import("../auth");
const { mailboxesRoutes } = await import("./mailboxes");
const app = new Elysia().use(mailboxesRoutes);
let dataDir = "";

const { createApiKeyForUser } = await import("../apiKeyAuth");

const request = (pathName: string, authorization?: string) =>
  app.handle(
    new Request(`http://localhost${pathName}`, {
      headers: authorization === undefined ? {} : { authorization },
    }),
  );

const call = async (
  pathName: string,
  method: string,
  body?: unknown,
  userId = "owner-1",
) => {
  const token = await issueAuthToken(userId);
  return app.handle(
    new Request(`http://localhost${pathName}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
};

describe("mailbox routes", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-mailbox-route-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
    addUser({ id: "owner-1", googleId: "google-1", createdAt: 1 });
    addUser({ id: "viewer-1", googleId: "google-2", createdAt: 1 });
    addMailbox({
      id: "mbx00001",
      ownerId: "owner-1",
      localPart: "inbox",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("creates mailboxes that expire", async () => {
    const created = await call("/api/mailboxes", "POST", {});
    expect(created.status).toBe(201);
    const { expiresAt } = (await created.json()) as { expiresAt?: number };
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  test("refuses to delete a locked mailbox", async () => {
    const locked = await call("/api/mailboxes/mbx00001/lock", "POST", {
      locked: true,
    });
    expect(locked.status).toBe(200);
    expect(await locked.json()).toMatchObject({ locked: true });

    const refused = await call("/api/mailboxes/mbx00001", "DELETE");
    expect(refused.status).toBe(409);
    expect(hasActiveMailbox("mbx00001")).toBe(true);

    await call("/api/mailboxes/mbx00001/lock", "POST", { locked: false });
    const deleted = await call("/api/mailboxes/mbx00001", "DELETE");
    expect(deleted.status).toBe(200);
    expect(hasActiveMailbox("mbx00001")).toBe(false);
  });

  test("extends without a body and keeps forever on self-hosted servers", async () => {
    const extended = await call("/api/mailboxes/mbx00001/extend", "POST");
    expect(extended.status).toBe(200);
    const { expiresAt } = (await extended.json()) as { expiresAt: number };
    expect(expiresAt).toBeGreaterThan(Date.now() + 60_000);

    const forever = await call("/api/mailboxes/mbx00001/extend", "POST", {
      forever: true,
    });
    expect(forever.status).toBe(200);
    expect(
      ((await forever.json()) as { expiresAt?: number }).expiresAt,
    ).toBeUndefined();
  });

  test("lets anyone read a public mailbox but only the owner change it", async () => {
    const raw =
      "From: a@example.com\r\nTo: inbox@mbx00001.test\r\nSubject: Hi\r\n\r\nbody";
    addMailMessage({
      id: "msg-1",
      mailboxId: "mbx00001",
      direction: "inbound",
      timestamp: Date.now(),
      isRead: false,
      fromName: null,
      fromAddress: "a@example.com",
      toJson: ["inbox@mbx00001.test"],
      subject: "Hi",
      preview: "body",
      attachmentCount: 0,
      sizeBytes: raw.length,
      messageId: null,
      mailFrom: "a@example.com",
      rcptToJson: ["inbox@mbx00001.test"],
      clientAddress: null,
      raw,
    });
    const readPaths = [
      "/api/mailboxes/mbx00001",
      "/api/mailboxes/mbx00001/messages",
      "/api/mailboxes/mbx00001/messages/msg-1",
      "/api/mailboxes/mbx00001/messages/msg-1/raw",
    ];
    const viewer = `Bearer ${await issueAuthToken("viewer-1")}`;

    for (const pathName of readPaths) {
      expect((await request(pathName)).status).toBe(404);
      expect((await request(pathName, viewer)).status).toBe(404);
    }

    const refused = await call(
      "/api/mailboxes/mbx00001/public",
      "POST",
      { public: true },
      "viewer-1",
    );
    expect(refused.status).toBe(404);

    const published = await call("/api/mailboxes/mbx00001/public", "POST", {
      public: true,
    });
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ public: true });

    for (const pathName of readPaths) {
      expect((await request(pathName)).status).toBe(200);
      expect((await request(pathName, viewer)).status).toBe(200);
    }
    const page = (await (
      await request("/api/mailboxes/mbx00001/messages")
    ).json()) as { messages: { id: string }[] };
    expect(page.messages.map(({ id }) => id)).toEqual(["msg-1"]);

    const writes: [string, string, unknown?][] = [
      ["/api/mailboxes/mbx00001", "PATCH", { label: "x" }],
      ["/api/mailboxes/mbx00001", "DELETE"],
      ["/api/mailboxes/mbx00001/lock", "POST", { locked: true }],
      ["/api/mailboxes/mbx00001/messages/msg-1", "PATCH", { read: true }],
      ["/api/mailboxes/mbx00001/messages/msg-1", "DELETE"],
      ["/api/mailboxes/mbx00001/messages", "DELETE"],
    ];
    for (const [pathName, method, body] of writes) {
      const response = await call(pathName, method, body, "viewer-1");
      expect(response.status).toBe(404);
    }
    expect(hasActiveMailbox("mbx00001")).toBe(true);

    await call("/api/mailboxes/mbx00001/public", "POST", { public: false });
    expect((await request("/api/mailboxes/mbx00001")).status).toBe(404);
  });

  test("requires mailboxes:read for private mailboxes only", async () => {
    const { secret } = createApiKeyForUser({
      userId: "owner-1",
      name: "no-mail",
      scopes: ["instances:read"],
    });
    const bearer = `Bearer ${secret}`;
    expect((await request("/api/mailboxes/mbx00001", bearer)).status).toBe(403);

    await call("/api/mailboxes/mbx00001/public", "POST", { public: true });
    expect((await request("/api/mailboxes/mbx00001", bearer)).status).toBe(200);
  });
});
