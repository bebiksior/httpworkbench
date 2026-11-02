import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { instancePolicies } from "../../config";
import { addInstance, addLog, closeDb, getDb, initDb } from "../../storage";
import { instances, logs } from "../../storage/schema";
import { runInstanceMaintenance } from "./maintenance";

const originalReapUnusedAfterMs = instancePolicies.reapUnusedAfterMs;
const hourMs = 60 * 60 * 1000;
const now = 100 * hourMs;
let dataDir = "";

const addTestInstance = (
  id: string,
  overrides: Partial<Parameters<typeof addInstance>[0]> = {},
) =>
  addInstance({
    id,
    ownerId: "owner-1",
    createdAt: now - 10 * hourMs,
    webhookIds: [],
    public: false,
    locked: false,
    raw: "HTTP/1.1 200 OK\r\n\r\nok",
    ...overrides,
  });

const remainingIds = () =>
  getDb()
    .select({ id: instances.id })
    .from(instances)
    .all()
    .map(({ id }) => id)
    .sort();

describe("instance maintenance", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-maintenance-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
  });

  afterEach(() => {
    instancePolicies.reapUnusedAfterMs = originalReapUnusedAfterMs;
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("removes expired instances and their logs", () => {
    instancePolicies.reapUnusedAfterMs = undefined;
    addTestInstance("expired", {
      expiresAt: now - 1,
      createdByApiKeyId: "key-1",
    });
    addTestInstance("active", { expiresAt: now + hourMs });
    addTestInstance("forever");
    addLog({
      id: "log-1",
      instanceId: "expired",
      type: "http",
      timestamp: now - 2 * hourMs,
      address: "198.51.100.1",
      raw: "GET / HTTP/1.1\r\n\r\n",
    });

    expect(runInstanceMaintenance(now)).toEqual({
      expired: ["expired"],
      unused: [],
    });
    expect(remainingIds()).toEqual(["active", "forever"]);
    expect(getDb().select().from(logs).all()).toEqual([]);
  });

  test("reaps unused API key instances when enabled", () => {
    instancePolicies.reapUnusedAfterMs = 6 * hourMs;
    addTestInstance("unused", { createdByApiKeyId: "key-1" });
    addTestInstance("fresh", {
      createdByApiKeyId: "key-1",
      createdAt: now - hourMs,
    });
    addTestInstance("used", { createdByApiKeyId: "key-1" });
    addTestInstance("locked", { createdByApiKeyId: "key-1", locked: true });
    addTestInstance("public", { createdByApiKeyId: "key-1", public: true });
    addTestInstance("from-ui");
    addLog({
      id: "log-1",
      instanceId: "used",
      type: "dns",
      timestamp: now - hourMs,
      address: "198.51.100.1",
      raw: "used.instances.example.com A",
    });

    expect(runInstanceMaintenance(now).unused).toEqual(["unused"]);
    expect(remainingIds()).toEqual([
      "fresh",
      "from-ui",
      "locked",
      "public",
      "used",
    ]);
  });
});
