import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  addInstance,
  addUser,
  closeDb,
  getInstanceById,
  getDb,
  getInstanceSummariesByOwner,
  initDb,
} from "../../storage";
import { userNotices } from "../../storage/schema";

process.env.JWT_SECRET = "mcp-instance-tools-test-secret";
process.env.INSTANCES_DOMAIN = "instances.example.com";
process.env.DOMAIN = "test.local";

const [{ createApiKeyForUser }, { closeMcpHandler, handleMcpRequest }] =
  await Promise.all([import("../apiKeyAuth"), import("../mcp")]);

const connectClient = async (apiKey: string) => {
  const requests: Array<{
    method: string | null;
    name: string | null;
    protocolVersion: string | null;
  }> = [];
  const transport = new StreamableHTTPClientTransport(
    new URL("http://test.local/mcp"),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set("host", "test.local");
        requests.push({
          method: headers.get("mcp-method"),
          name: headers.get("mcp-name"),
          protocolVersion: headers.get("mcp-protocol-version"),
        });
        return handleMcpRequest(
          new Request(url.toString(), { ...init, headers }),
        );
      },
    },
  );
  const client = new Client(
    { name: "test", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(transport);
  return { client, requests };
};

describe("MCP instance tools", () => {
  let dataDir = "";
  let apiKey = "";

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-mcp-tools-"));
    const result = initDb({ dataDir, reset: true });
    if (result.kind === "error") {
      throw result.error;
    }
    addUser({ id: "owner-1", googleId: "google-1", createdAt: 1 });
    addInstance({
      id: "instance-1",
      ownerId: "owner-1",
      createdAt: 1,
      webhookIds: [],
      public: false,
      locked: false,
      raw: "HTTP/1.1 200 OK\r\n\r\nok",
    });
    apiKey = createApiKeyForUser({
      userId: "owner-1",
      name: "MCP test",
      scopes: ["instances:write"],
    }).secret;
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await closeMcpHandler();
  });

  test.each([
    { ttlHours: undefined, expectedHours: 72 },
    { ttlHours: 1, expectedHours: 1 },
    { ttlHours: 24, expectedHours: 24 },
  ])(
    "persists and returns expiry for ttlHours=$ttlHours",
    async ({ ttlHours, expectedHours }) => {
      const { client } = await connectClient(apiKey);
      try {
        const result = await client.callTool({
          name: "create_instance",
          arguments: {
            raw: "HTTP/1.1 200 OK\r\n\r\nok",
            ...(ttlHours === undefined ? {} : { ttlHours }),
          },
        });
        expect(result.isError).not.toBe(true);
        const created = getInstanceSummariesByOwner("owner-1").find(
          ({ id }) => id !== "instance-1",
        );
        if (created === undefined) {
          throw new Error("Instance was not persisted");
        }
        expect(created.expiresAt).toBe(
          created.createdAt + expectedHours * 60 * 60 * 1000,
        );
        expect(result.structuredContent).toMatchObject({
          instance: { id: created.id, expiresAt: created.expiresAt },
        });
        expect(getInstanceById(created.id)?.createdByApiKeyId).toBeDefined();

        await client.callTool({
          name: "update_instance",
          arguments: {
            instanceId: created.id,
            raw: "HTTP/1.1 204 No Content\r\n\r\n",
          },
        });
        expect(getInstanceById(created.id)?.expiresAt).toBe(created.expiresAt);
      } finally {
        await client.close();
      }
    },
  );

  test.each([0, 73, 336, "24", null])(
    "rejects unsupported ttlHours=%j",
    async (ttlHours) => {
      const { client } = await connectClient(apiKey);
      try {
        const result = await client.callTool({
          name: "create_instance",
          arguments: { raw: "HTTP/1.1 200 OK\r\n\r\nok", ttlHours },
        });
        expect(result.isError).toBe(true);
        expect(getInstanceSummariesByOwner("owner-1")).toHaveLength(1);
      } finally {
        await client.close();
      }
    },
  );

  test("explains why an instance removed for excessive traffic is gone", async () => {
    getDb()
      .insert(userNotices)
      .values({
        id: "notice-1",
        userId: "owner-1",
        kind: "instance_removed_noise",
        instanceId: "removed-1",
        createdAt: 1,
      })
      .run();
    const { client } = await connectClient(apiKey);
    try {
      const removed = await client.callTool({
        name: "set_instance_public",
        arguments: { instanceId: "removed-1", public: true },
      });
      expect(removed.isError).toBe(true);
      expect(JSON.stringify(removed.content)).toContain("abuse protection");

      const missing = await client.callTool({
        name: "set_instance_public",
        arguments: { instanceId: "never-existed", public: true },
      });
      expect(JSON.stringify(missing.content)).toContain("Instance not found");
    } finally {
      await client.close();
    }
  });

  test("manages per-path responses", async () => {
    const { client } = await connectClient(apiKey);
    try {
      const added = await client.callTool({
        name: "set_instance_route",
        arguments: {
          instanceId: "instance-1",
          path: "/redirect",
          raw: "HTTP/1.1 302 Found\nLocation: /final\n\n",
        },
      });
      expect(added.isError).not.toBe(true);
      await client.callTool({
        name: "set_instance_route",
        arguments: {
          instanceId: "instance-1",
          method: "POST",
          path: "/redirect",
          raw: "HTTP/1.1 201 Created\r\n\r\n",
        },
      });
      const replaced = await client.callTool({
        name: "set_instance_route",
        arguments: {
          instanceId: "instance-1",
          path: "/redirect",
          raw: "HTTP/1.1 307 Temporary Redirect\r\nLocation: /final\r\n\r\n",
        },
      });
      expect(replaced.isError).not.toBe(true);
      expect(getInstanceById("instance-1")?.routes).toEqual([
        {
          path: "/redirect",
          raw: "HTTP/1.1 307 Temporary Redirect\r\nLocation: /final\r\n\r\n",
        },
        {
          method: "POST",
          path: "/redirect",
          raw: "HTTP/1.1 201 Created\r\n\r\n",
        },
      ]);

      const invalid = await client.callTool({
        name: "set_instance_route",
        arguments: {
          instanceId: "instance-1",
          path: "/broken",
          raw: "not http",
        },
      });
      expect(invalid.isError).toBe(true);

      const deleted = await client.callTool({
        name: "delete_instance_route",
        arguments: { instanceId: "instance-1", path: "/redirect" },
      });
      expect(deleted.isError).not.toBe(true);
      expect(getInstanceById("instance-1")?.routes).toEqual([
        {
          method: "POST",
          path: "/redirect",
          raw: "HTTP/1.1 201 Created\r\n\r\n",
        },
      ]);

      const cleared = await client.callTool({
        name: "update_instance",
        arguments: { instanceId: "instance-1", routes: [] },
      });
      expect(cleared.isError).not.toBe(true);
      expect(getInstanceById("instance-1")?.routes).toEqual([]);
      expect(getInstanceById("instance-1")?.raw).toBe(
        "HTTP/1.1 200 OK\r\n\r\nok",
      );
    } finally {
      await client.close();
    }
  });

  test("filters and pages list_instances", async () => {
    const readKey = createApiKeyForUser({
      userId: "owner-1",
      name: "MCP list test",
      scopes: ["instances:read"],
    }).secret;
    for (let index = 0; index < 5; index += 1) {
      addInstance({
        id: `run-${index}`,
        ownerId: "owner-1",
        createdAt: 10 + index,
        label: index < 3 ? `devwild-api-${index}` : `vrbo-${index}`,
        webhookIds: [],
        public: false,
        locked: false,
        raw: "HTTP/1.1 200 OK\r\n\r\nok",
      });
    }
    const { client } = await connectClient(readKey);
    try {
      const first = await client.callTool({
        name: "list_instances",
        arguments: { labelPrefix: "devwild-", limit: 2 },
      });
      const firstPage = first.structuredContent as {
        total: number;
        instances: Array<{ id: string; ownerId?: string }>;
        nextCursor?: string;
      };
      expect(firstPage.total).toBe(3);
      expect(firstPage.instances.map(({ id }) => id)).toEqual([
        "run-2",
        "run-1",
      ]);
      expect(firstPage.instances[0]?.ownerId).toBeUndefined();
      expect(firstPage.nextCursor).toBeDefined();

      const second = await client.callTool({
        name: "list_instances",
        arguments: {
          labelPrefix: "devwild-",
          limit: 2,
          cursor: firstPage.nextCursor,
        },
      });
      expect(second.structuredContent).toMatchObject({
        total: 3,
        instances: [{ id: "run-0" }],
      });
      expect(
        (second.structuredContent as { nextCursor?: string }).nextCursor,
      ).toBeUndefined();

      const searched = await client.callTool({
        name: "list_instances",
        arguments: { query: "VRBO" },
      });
      expect(searched.structuredContent).toMatchObject({ total: 2 });
    } finally {
      await client.close();
    }
  });

  test("bulk deletes matching unlocked instances", async () => {
    const deleteKey = createApiKeyForUser({
      userId: "owner-1",
      name: "MCP delete test",
      scopes: ["instances:write", "instances:delete"],
    }).secret;
    for (const [id, locked] of [
      ["run-a", false],
      ["run-b", true],
      ["run-c", false],
    ] as const) {
      addInstance({
        id,
        ownerId: "owner-1",
        createdAt: 5,
        label: `run-42 ${id}`,
        webhookIds: [],
        public: false,
        locked,
        raw: "HTTP/1.1 200 OK\r\n\r\nok",
      });
    }
    const { client } = await connectClient(deleteKey);
    try {
      const unfiltered = await client.callTool({
        name: "delete_instances",
        arguments: {},
      });
      expect(unfiltered.isError).toBe(true);

      const blankQuery = await client.callTool({
        name: "delete_instances",
        arguments: { query: "   " },
      });
      expect(blankQuery.isError).toBe(true);

      const preview = await client.callTool({
        name: "delete_instances",
        arguments: { labelPrefix: "run-42", dryRun: true },
      });
      expect(preview.structuredContent).toEqual({
        wouldDelete: 2,
        ids: ["run-a", "run-c"],
      });
      expect(getInstanceById("run-a")).toBeDefined();

      const deleted = await client.callTool({
        name: "delete_instances",
        arguments: { labelPrefix: "run-42" },
      });
      expect(deleted.structuredContent).toMatchObject({ deleted: 2 });
      expect(getInstanceById("run-a")).toBeUndefined();
      expect(getInstanceById("run-b")).toBeDefined();
      expect(getInstanceById("instance-1")).toBeDefined();
    } finally {
      await client.close();
    }
  });

  test("extends instances and keeps locked ones alive", async () => {
    const createdAt = Date.now();
    addInstance({
      id: "short-lived",
      ownerId: "owner-1",
      createdAt,
      expiresAt: createdAt + 60 * 60 * 1000,
      webhookIds: [],
      public: false,
      locked: false,
      raw: "HTTP/1.1 200 OK\r\n\r\nok",
    });
    const dayMs = 24 * 60 * 60 * 1000;
    const { client } = await connectClient(apiKey);
    try {
      const extended = await client.callTool({
        name: "extend_instance",
        arguments: { instanceId: "short-lived", ttlDays: 7 },
      });
      expect(extended.isError).not.toBe(true);
      const afterExtend = getInstanceById("short-lived")?.expiresAt ?? 0;
      expect(afterExtend).toBeGreaterThanOrEqual(createdAt + 7 * dayMs);

      await client.callTool({
        name: "extend_instance",
        arguments: { instanceId: "short-lived", ttlDays: 1 },
      });
      expect(getInstanceById("short-lived")?.expiresAt).toBe(afterExtend);

      const tooLong = await client.callTool({
        name: "extend_instance",
        arguments: { instanceId: "short-lived", ttlDays: 31 },
      });
      expect(tooLong.isError).toBe(true);

      await client.callTool({
        name: "set_instance_locked",
        arguments: { instanceId: "short-lived", locked: true },
      });
      expect(
        getInstanceById("short-lived")?.expiresAt ?? 0,
      ).toBeGreaterThanOrEqual(createdAt + 30 * dayMs);

      await client.callTool({
        name: "extend_instance",
        arguments: { instanceId: "instance-1", ttlDays: 3 },
      });
      expect(getInstanceById("instance-1")?.expiresAt).toBeUndefined();
    } finally {
      await client.close();
    }
  });

  test("serves MCP 2026-07-28 and updates instance visibility", async () => {
    const { client, requests } = await connectClient(apiKey);
    try {
      expect(client.getProtocolEra()).toBe("modern");
      expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");

      const tools = await client.listTools();
      const visibilityTool = tools.tools.find(
        ({ name }) => name === "set_instance_public",
      );
      expect(visibilityTool?.description).toContain(
        "https://httpworkbench.com/instances/:id",
      );
      expect(visibilityTool?.description).toContain("read-only");

      const published = await client.callTool({
        name: "set_instance_public",
        arguments: { instanceId: "instance-1", public: true },
      });
      expect(published.isError).not.toBe(true);
      expect(getInstanceById("instance-1")?.public).toBe(true);
      expect(requests).toContainEqual({
        method: "tools/call",
        name: "set_instance_public",
        protocolVersion: "2026-07-28",
      });

      const unpublished = await client.callTool({
        name: "set_instance_public",
        arguments: { instanceId: "instance-1", public: false },
      });
      expect(unpublished.isError).not.toBe(true);
      expect(getInstanceById("instance-1")?.public).toBe(false);
    } finally {
      await client.close();
    }
  });

  test("locks an instance so delete_instance fails until unlocked", async () => {
    const lockKey = createApiKeyForUser({
      userId: "owner-1",
      name: "MCP lock test",
      scopes: ["instances:write", "instances:delete"],
    }).secret;
    const { client } = await connectClient(lockKey);
    try {
      const tools = await client.listTools();
      const lockTool = tools.tools.find(
        ({ name }) => name === "set_instance_locked",
      );
      expect(lockTool?.description).toContain("extends an expiring one");

      const locked = await client.callTool({
        name: "set_instance_locked",
        arguments: { instanceId: "instance-1", locked: true },
      });
      expect(locked.isError).not.toBe(true);
      expect(locked.structuredContent).toMatchObject({
        instance: { id: "instance-1", locked: true },
      });
      expect(getInstanceById("instance-1")?.locked).toBe(true);

      const blocked = await client.callTool({
        name: "delete_instance",
        arguments: { instanceId: "instance-1" },
      });
      expect(blocked.isError).toBe(true);
      expect(getInstanceById("instance-1")).toBeDefined();

      await client.callTool({
        name: "set_instance_locked",
        arguments: { instanceId: "instance-1", locked: false },
      });
      const deleted = await client.callTool({
        name: "delete_instance",
        arguments: { instanceId: "instance-1" },
      });
      expect(deleted.isError).not.toBe(true);
      expect(getInstanceById("instance-1")).toBeUndefined();
    } finally {
      await client.close();
    }
  });
});
