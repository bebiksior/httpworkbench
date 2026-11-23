import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Elysia } from "elysia";

process.env.JWT_SECRET = "mailbox-routes-test-secret";
process.env.SMTP_ENABLED = "true";

const { addMailbox, addUser, closeDb, hasActiveMailbox, initDb } =
  await import("../../storage");

const { issueAuthToken } = await import("../auth");
const { mailboxesRoutes } = await import("./mailboxes");
const app = new Elysia().use(mailboxesRoutes);
let dataDir = "";

const call = async (pathName: string, method: string, body?: unknown) => {
  const token = await issueAuthToken("owner-1");
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
});
