import { describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { dotStuff, sendSmtp, SmtpConnectionError } from "./client";
import { createSmtpServer, type InboundMailboxMessage } from "./server";

describe("dotStuff", () => {
  test("escapes leading dots and normalizes line endings", () => {
    expect(dotStuff(".hidden\n..two\nplain")).toBe(
      "..hidden\r\n...two\r\nplain\r\n",
    );
  });
});

describe("sendSmtp", () => {
  test("delivers a message to the built-in SMTP server", async () => {
    const stored: InboundMailboxMessage[] = [];
    const server = await createSmtpServer({
      config: {
        smtpEnabled: true,
        instancesDomain: "instances.example.com",
        smtpPort: 0,
      },
      deps: {
        findRecipient: async (id) => (id === "mbx" ? "mailbox" : undefined),
        storeMailboxMessage: async (message) => {
          stored.push(message);
        },
        addLog: (log) => log,
        broadcastLog: () => undefined,
        createId: () => "id",
        now: () => 1,
      },
    });

    try {
      const result = await sendSmtp(
        {
          host: "127.0.0.1",
          port: server.port,
          tls: "opportunistic",
          verifyCertificate: false,
          heloName: "client.test",
          timeoutMs: 2000,
          deadlineMs: 5000,
        },
        {
          from: "me@example.org",
          to: [
            "hi@mbx.instances.example.com",
            "nobody@zzz.instances.example.com",
          ],
          data: "Subject: Test\r\n\r\n.starts with a dot\r\n",
        },
      );

      expect(result.accepted).toEqual(["hi@mbx.instances.example.com"]);
      expect(result.rejected).toEqual([
        {
          address: "nobody@zzz.instances.example.com",
          error: "550 5.1.1 No such instance",
        },
      ]);
      expect(stored).toHaveLength(1);
      expect(stored[0]?.raw).toBe(
        "Subject: Test\r\n\r\n.starts with a dot\r\n",
      );
      expect(stored[0]?.mailFrom).toBe("me@example.org");
    } finally {
      await server.stop();
    }
  });

  test("times out a stalled STARTTLS handshake", async () => {
    const server = createServer((socket) => {
      socket.write("220 stall.test\r\n");
      socket.on("data", (chunk) => {
        const line = chunk.toString();
        if (line.startsWith("EHLO")) {
          socket.write("250-stall.test\r\n250 STARTTLS\r\n");
        } else if (line.startsWith("STARTTLS")) {
          socket.write("220 Go ahead\r\n");
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    const port =
      typeof address === "object" && address !== null ? address.port : 0;

    try {
      const attempt = sendSmtp(
        {
          host: "127.0.0.1",
          port,
          tls: "starttls",
          verifyCertificate: false,
          heloName: "client.test",
          timeoutMs: 200,
          deadlineMs: 5000,
        },
        { from: "a@b.c", to: ["x@y.z"], data: "x" },
      );
      const error = await attempt.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SmtpConnectionError);
      expect((error as Error).message).toBe("TLS handshake timed out");
    } finally {
      server.close();
    }
  });

  test("gives up once the overall deadline passes", async () => {
    const server = createServer((socket) => {
      socket.write("220 slow.test\r\n");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    const port =
      typeof address === "object" && address !== null ? address.port : 0;

    try {
      const error = await sendSmtp(
        {
          host: "127.0.0.1",
          port,
          tls: "none",
          verifyCertificate: false,
          heloName: "client.test",
          timeoutMs: 5000,
          deadlineMs: 150,
        },
        { from: "a@b.c", to: ["x@y.z"], data: "x" },
      ).catch((caught: unknown) => caught);
      expect((error as Error).message).toBe("Delivery timed out");
    } finally {
      server.close();
    }
  });

  test("counts a stalled implicit TLS connection against the deadline", async () => {
    const server = createServer(() => undefined);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    const port =
      typeof address === "object" && address !== null ? address.port : 0;

    try {
      const startedAt = Date.now();
      const error = await sendSmtp(
        {
          host: "127.0.0.1",
          port,
          tls: "implicit",
          verifyCertificate: false,
          heloName: "client.test",
          timeoutMs: 5000,
          deadlineMs: 100,
        },
        { from: "a@b.c", to: ["x@y.z"], data: "x" },
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SmtpConnectionError);
      expect(Date.now() - startedAt).toBeLessThan(1000);
    } finally {
      server.close();
    }
  });
});
