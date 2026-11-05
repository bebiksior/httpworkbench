import {
  afterAll,
  beforeAll,
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

const smtpPort = 20_000 + Math.floor(Math.random() * 20_000);
process.env.JWT_SECRET = "mcp-mailbox-tools-test-secret";
process.env.INSTANCES_DOMAIN = "instances.example.com";
process.env.DOMAIN = "test.local";
process.env.SMTP_ENABLED = "true";
process.env.SMTP_SENDING_ENABLED = "true";
process.env.SMTP_PORT = String(smtpPort);

const [
  { addUser, closeDb, hasActiveMailbox, initDb },
  { createApiKeyForUser },
  { closeMcpHandler, handleMcpRequest },
  { createSmtpServer },
  { storeInboundMail },
] = await Promise.all([
  import("../../storage"),
  import("../apiKeyAuth"),
  import("../mcp"),
  import("../smtp"),
  import("../mailboxes"),
]);

type ToolResult = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

const connectClient = async (apiKey: string) => {
  const transport = new StreamableHTTPClientTransport(
    new URL("http://test.local/mcp"),
    {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set("host", "test.local");
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
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as ToolResult;
  return { client, call };
};

describe("MCP mailbox tools", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-mcp-mail-"));
  let smtpServer: Awaited<ReturnType<typeof createSmtpServer>>;

  beforeAll(async () => {
    initDb({ dataDir, reset: true });
    addUser({ id: "owner-1", googleId: "google-1", createdAt: 1 });
    smtpServer = await createSmtpServer({
      deps: {
        findRecipient: async (id) =>
          hasActiveMailbox(id) ? "mailbox" : undefined,
        storeMailboxMessage: storeInboundMail,
        addLog: (log) => log,
        broadcastLog: () => undefined,
        createId: () => crypto.randomUUID(),
        now: () => Date.now(),
      },
    });
  });

  afterAll(async () => {
    await smtpServer.stop();
    await closeMcpHandler();
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  let apiKey = "";
  beforeEach(() => {
    apiKey = createApiKeyForUser({
      userId: "owner-1",
      name: "MCP mail",
    }).secret;
  });

  test("sends, waits for and reads mail", async () => {
    const { client, call } = await connectClient(apiKey);
    try {
      const created = await call("create_mailbox", { label: "signup" });
      const mailbox = created.structuredContent?.mailbox as {
        id: string;
        address: string;
      };
      expect(mailbox.address).toBe(`inbox@${mailbox.id}.instances.example.com`);

      const watch = call("watch_mailbox", { mailboxId: mailbox.id });
      const sent = await call("send_email", {
        mailboxId: mailbox.id,
        to: [`reset@${mailbox.id}.instances.example.com`],
        subject: "Reset",
        text: "Open https://target.example/reset?token=abc.",
      });
      expect(sent.isError).not.toBe(true);

      const watched = await watch;
      const [message] = watched.structuredContent?.messages as {
        id: string;
        subject: string;
      }[];
      expect(message?.subject).toBe("Reset");

      const read = await call("read_message", {
        mailboxId: mailbox.id,
        messageId: message?.id,
      });
      expect(read.structuredContent?.message).toMatchObject({
        text: "Open https://target.example/reset?token=abc.",
        links: ["https://target.example/reset?token=abc"],
        read: true,
      });

      const sentFolder = await call("list_messages", {
        mailboxId: mailbox.id,
        folder: "sent",
      });
      expect(sentFolder.structuredContent?.messages).toHaveLength(1);

      const listed = await call("list_mailboxes", {});
      expect(listed.structuredContent?.mailboxes).toMatchObject([
        { id: mailbox.id, messageCount: 1, unreadCount: 0 },
      ]);
    } finally {
      await client.close();
    }
  });

  test("requires the send scope to send mail", async () => {
    const limitedKey = createApiKeyForUser({
      userId: "owner-1",
      name: "read only",
      scopes: ["mailboxes:read", "mailboxes:write"],
    }).secret;
    const { client, call } = await connectClient(limitedKey);
    try {
      const created = await call("create_mailbox", {});
      const mailbox = created.structuredContent?.mailbox as { id: string };
      const sent = await call("send_email", {
        mailboxId: mailbox.id,
        to: ["a@example.org"],
        subject: "x",
        text: "x",
      });
      expect(sent.isError).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("hides other users' mailboxes", async () => {
    addUser({ id: "owner-2", googleId: "google-2", createdAt: 1 });
    const { client: ownerClient, call: ownerCall } =
      await connectClient(apiKey);
    const created = await ownerCall("create_mailbox", {});
    await ownerClient.close();
    const mailbox = created.structuredContent?.mailbox as { id: string };

    const otherKey = createApiKeyForUser({
      userId: "owner-2",
      name: "other",
    }).secret;
    const { client, call } = await connectClient(otherKey);
    try {
      const result = await call("list_messages", { mailboxId: mailbox.id });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
    }
  });
});
