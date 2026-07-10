import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDb, initDb } from "../storage";
import {
  authenticateGuestInstance,
  readGuestManagementToken,
  readGuestWebSocketProtocol,
} from "./guestAccess";
import { createGuestInstance } from "./instances/service";

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

  test("authenticates only the generated token and parses safe transports", () => {
    const created = createGuestInstance("HTTP/1.1 200 OK\n\nok");
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    expect(
      authenticateGuestInstance(created.value.instance.id, created.value.token),
    ).toBe(true);
    expect(
      authenticateGuestInstance(created.value.instance.id, "0".repeat(64)),
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
