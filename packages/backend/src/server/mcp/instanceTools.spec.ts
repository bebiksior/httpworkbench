import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiKeyAuthContext } from "../apiKeyAuth";
import {
  addInstance,
  addUser,
  closeDb,
  getInstanceById,
  initDb,
} from "../../storage";

process.env.JWT_SECRET = "mcp-instance-tools-test-secret";
process.env.INSTANCES_DOMAIN = "instances.example.com";

const { registerInstanceTools } = await import("./instanceTools");

const auth: ApiKeyAuthContext = {
  apiKey: {
    id: "api-key-1",
    userId: "owner-1",
    name: "MCP test",
    prefix: "hwb_test",
    scopes: ["instances:write"],
    createdAt: 1,
  },
  user: { id: "owner-1", googleId: "google-1", createdAt: 1 },
};

const connectClient = async () => {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerInstanceTools(server);
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const send = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) =>
    send(message, {
      ...options,
      authInfo: {
        token: auth.apiKey.id,
        clientId: auth.apiKey.id,
        scopes: auth.apiKey.scopes,
        extra: { httpworkbenchAuth: auth },
      },
    });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
};

describe("MCP instance tools", () => {
  let dataDir = "";

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
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("publishes and unpublishes an owned instance", async () => {
    const { client, server } = await connectClient();
    try {
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

      const unpublished = await client.callTool({
        name: "set_instance_public",
        arguments: { instanceId: "instance-1", public: false },
      });
      expect(unpublished.isError).not.toBe(true);
      expect(getInstanceById("instance-1")?.public).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
