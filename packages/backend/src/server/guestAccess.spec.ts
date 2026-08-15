import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDb, initDb } from "../storage";

process.env.JWT_SECRET = "guest-access-test-secret";

const {
  authenticateGuestInstance,
  issueGuestManagementToken,
  readGuestManagementToken,
  readGuestWebSocketProtocol,
} = await import("./guestAccess");
const { issueAuthToken } = await import("./auth");
const { createGuestInstance } = await import("./instances/service");

let dataDir = "";

describe("guest management access", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-guest-access-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("authenticates only the generated token and parses safe transports", async () => {
    const created = await createGuestInstance("HTTP/1.1 200 OK\n\nok");
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    expect(
      await authenticateGuestInstance(
        created.value.instance,
        created.value.token,
      ),
    ).toBe(true);
    expect(
      await authenticateGuestInstance(
        { ...created.value.instance, id: "other-id" },
        created.value.token,
      ),
    ).toBe(false);
    expect(
      await authenticateGuestInstance(
        {
          ...created.value.instance,
          createdAt: created.value.instance.createdAt + 1,
        },
        created.value.token,
      ),
    ).toBe(false);

    const sessionToken = await issueAuthToken(created.value.instance.id);
    expect(
      await authenticateGuestInstance(created.value.instance, sessionToken),
    ).toBe(false);

    const expired = await issueGuestManagementToken(
      created.value.instance,
      Date.now() - 2_000,
    );
    expect(
      await authenticateGuestInstance(created.value.instance, expired),
    ).toBe(false);

    const request = new Request("http://localhost", {
      headers: {
        "x-guest-token": created.value.token,
        "sec-websocket-protocol": `other, guest-token.${created.value.token}`,
      },
    });
    expect(readGuestManagementToken(request)).toBe(created.value.token);
    expect(readGuestWebSocketProtocol(request)).toEqual({
      protocol: `guest-token.${created.value.token}`,
      token: created.value.token,
    });
  });
});
