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
  initDb,
} from "../../storage";

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
      expect(visibilityTool?.description).toContain("Access is read-only");

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
});
