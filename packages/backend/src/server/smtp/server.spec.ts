import { createConnection } from "node:net";
import { describe, expect, test } from "bun:test";
import type { Instance, Log } from "shared";
import {
  createSmtpServer,
  createSmtpSession,
  type SmtpServerDependencies,
} from "./server";
import { maxSmtpDataBytes } from "./utils";

const runtimeConfig = {
  instancesDomain: "instances.example.com",
  smtpPort: 0,
};

const createInstance = (id: string): Instance => ({
  id,
  ownerId: "owner-1",
  createdAt: 1,
  webhookIds: [],
  public: false,
  locked: false,
  kind: "static",
  raw: "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
});

const createCapturingDeps = (knownInstanceId: string) => {
  const added: Log[] = [];
  const broadcasted: Log[] = [];

  const deps: SmtpServerDependencies = {
    getInstanceById: async (id) =>
      id === knownInstanceId ? createInstance(id) : undefined,
    addLog: async (log) => {
      added.push(log);
      return log;
    },
    broadcastLog: (log) => {
      broadcasted.push(log);
    },
    createId: () => `log-${added.length + 1}`,
    now: () => 1000,
  };

  return { added, broadcasted, deps };
};

const drive = async (
  session: ReturnType<typeof createSmtpSession>,
  lines: string[],
): Promise<string[]> => {
  const replies: string[] = [];
  for (const line of lines) {
    const result = await session.handleLine(line);
    replies.push(...result.replies);
  }
  return replies;
};

const smtpConversation = async (
  port: number,
  lines: string[],
): Promise<string> => {
  return await new Promise<string>((resolve, reject) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    let buffer = "";
    let sent = false;

    socket.setTimeout(2000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("SMTP conversation timed out"));
    });
    socket.on("error", reject);
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (!sent && buffer.includes("220 ")) {
        sent = true;
        socket.write(`${lines.join("\r\n")}\r\n`);
      }
    });
    socket.on("close", () => {
      resolve(buffer);
    });
  });
};

describe("createSmtpSession", () => {
  test("logs a message delivered to a known instance", async () => {
    const { added, broadcasted, deps } = createCapturingDeps("abc");
    const session = createSmtpSession({
      clientAddress: "198.51.100.5",
      config: runtimeConfig,
      deps,
    });

    const replies = await drive(session, [
      "EHLO evil.test",
      "MAIL FROM:<attacker@evil.test>",
      "RCPT TO:<poc@abc.instances.example.com>",
      "DATA",
      "Subject: hi",
      "",
      "hello",
      ".",
      "QUIT",
    ]);

    expect(replies.some((line) => line.startsWith("250-"))).toBe(true);
    expect(replies).toContain("250 2.1.0 OK\r\n");
    expect(replies).toContain("250 2.1.5 OK\r\n");
    expect(replies).toContain("354 End data with <CR><LF>.<CR><LF>\r\n");
    expect(replies).toContain("250 2.0.0 OK: queued\r\n");

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      instanceId: "abc",
      type: "smtp",
      address: "198.51.100.5",
      addressVerified: true,
    });
    expect(added[0]?.raw).toContain("RCPT TO: <poc@abc.instances.example.com>");
    expect(added[0]?.raw).toContain("hello");
    expect(broadcasted).toHaveLength(1);
  });

  test("rejects recipients that do not map to a live instance", async () => {
    const { added, deps } = createCapturingDeps("abc");
    const session = createSmtpSession({
      clientAddress: "1.2.3.4",
      config: runtimeConfig,
      deps,
    });

    const replies = await drive(session, [
      "EHLO x",
      "MAIL FROM:<a@b>",
      "RCPT TO:<poc@missing.instances.example.com>",
    ]);

    expect(replies).toContain("550 5.1.1 No such instance\r\n");
    expect(added).toHaveLength(0);
  });

  test("refuses to relay to out-of-zone recipients", async () => {
    const { deps } = createCapturingDeps("abc");
    const session = createSmtpSession({
      clientAddress: "1.2.3.4",
      config: runtimeConfig,
      deps,
    });

    const replies = await drive(session, [
      "EHLO x",
      "MAIL FROM:<a@b>",
      "RCPT TO:<victim@gmail.com>",
    ]);

    expect(replies).toContain("550 5.7.1 Relaying denied\r\n");
  });

  test("requires MAIL FROM before RCPT TO", async () => {
    const { deps } = createCapturingDeps("abc");
    const session = createSmtpSession({
      clientAddress: "1.2.3.4",
      config: runtimeConfig,
      deps,
    });

    const replies = await drive(session, [
      "EHLO x",
      "RCPT TO:<poc@abc.instances.example.com>",
    ]);

    expect(replies).toContain("503 5.5.1 Send MAIL FROM first\r\n");
  });

  test("rejects DATA without accepted recipients", async () => {
    const { deps } = createCapturingDeps("abc");
    const session = createSmtpSession({
      clientAddress: "1.2.3.4",
      config: runtimeConfig,
      deps,
    });

    const replies = await drive(session, [
      "EHLO x",
      "MAIL FROM:<a@b>",
      "RCPT TO:<nope@elsewhere.com>",
      "DATA",
    ]);

    expect(replies).toContain("554 5.5.1 No valid recipients\r\n");
  });

  test("logs once per instance even with multiple recipients", async () => {
    const { added, deps } = createCapturingDeps("abc");
    const session = createSmtpSession({
      clientAddress: "1.2.3.4",
      config: runtimeConfig,
      deps,
    });

    await drive(session, [
      "EHLO x",
      "MAIL FROM:<a@b>",
      "RCPT TO:<one@abc.instances.example.com>",
      "RCPT TO:<two@abc.instances.example.com>",
      "DATA",
      "hello",
      ".",
    ]);

    expect(added).toHaveLength(1);
  });

  test("dot-unstuffs the captured message", async () => {
    const { added, deps } = createCapturingDeps("abc");
    const session = createSmtpSession({
      clientAddress: "1.2.3.4",
      config: runtimeConfig,
      deps,
    });

    await drive(session, [
      "EHLO x",
      "MAIL FROM:<a@b>",
      "RCPT TO:<poc@abc.instances.example.com>",
      "DATA",
      "..dotted",
      ".",
    ]);

    expect(added[0]?.raw).toContain("\n.dotted");
  });

  test("truncates and rejects oversized messages", async () => {
    const { added, deps } = createCapturingDeps("abc");
    const session = createSmtpSession({
      clientAddress: "1.2.3.4",
      config: runtimeConfig,
      deps,
    });

    const replies = await drive(session, [
      "EHLO x",
      "MAIL FROM:<a@b>",
      "RCPT TO:<poc@abc.instances.example.com>",
      "DATA",
      "x".repeat(maxSmtpDataBytes + 10),
      ".",
    ]);

    expect(replies).toContain("552 5.3.4 Message size exceeds fixed limit\r\n");
    expect(added).toHaveLength(1);
    expect(added[0]?.raw).toContain("[truncated");
  });
});

describe("createSmtpServer", () => {
  test("accepts pipelined mail over a real socket and logs it", async () => {
    const { added, deps } = createCapturingDeps("abc");
    const server = await createSmtpServer({
      config: {
        smtpEnabled: true,
        instancesDomain: "instances.example.com",
        smtpPort: 0,
      },
      deps,
    });

    try {
      const transcript = await smtpConversation(server.port, [
        "EHLO tester",
        "MAIL FROM:<a@evil.test>",
        "RCPT TO:<poc@abc.instances.example.com>",
        "DATA",
        "Subject: ping",
        "",
        "body",
        ".",
        "QUIT",
      ]);

      expect(transcript).toContain("220 ");
      expect(transcript).toContain("250 2.0.0 OK: queued");
      expect(transcript).toContain("221 ");
      expect(added).toHaveLength(1);
      expect(added[0]?.raw).toContain("body");
    } finally {
      await server.stop();
    }
  });

  test("rejects an unknown recipient over a real socket", async () => {
    const { added, deps } = createCapturingDeps("abc");
    const server = await createSmtpServer({
      config: {
        smtpEnabled: true,
        instancesDomain: "instances.example.com",
        smtpPort: 0,
      },
      deps,
    });

    try {
      const transcript = await smtpConversation(server.port, [
        "EHLO tester",
        "MAIL FROM:<a@evil.test>",
        "RCPT TO:<poc@missing.instances.example.com>",
        "QUIT",
      ]);

      expect(transcript).toContain("550 5.1.1 No such instance");
      expect(added).toHaveLength(0);
    } finally {
      await server.stop();
    }
  });
});
