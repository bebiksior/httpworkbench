import { connect as connectTcp, isIP, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";

type SmtpTlsMode = "none" | "opportunistic" | "starttls" | "implicit";

export type SmtpClientOptions = {
  host: string;
  address?: string;
  port: number;
  tls: SmtpTlsMode;
  verifyCertificate: boolean;
  auth?: { user: string; pass: string };
  heloName: string;
  timeoutMs: number;
  deadlineMs: number;
};

export type SmtpEnvelope = {
  from: string;
  to: string[];
  data: string;
};

export type SmtpDeliveryResult = {
  accepted: string[];
  rejected: { address: string; error: string }[];
};

type SmtpReply = { code: number; lines: string[] };

export class SmtpConnectionError extends Error {}

const maxReplyBufferBytes = 64 * 1024;

const serverName = (host: string) => (isIP(host) === 0 ? host : undefined);

const formatReply = (reply: SmtpReply) =>
  reply.lines.map((line) => line.trim()).join(" ");

export const dotStuff = (data: string): string => {
  const normalized = data.replace(/\r?\n/g, "\r\n");
  const stuffed = normalized.replace(/(^|\r\n)\./g, "$1..");
  return stuffed.endsWith("\r\n") ? stuffed : `${stuffed}\r\n`;
};

const takeReply = (
  buffer: string,
): { reply: SmtpReply; rest: string } | undefined => {
  const lines: string[] = [];
  let offset = 0;
  for (;;) {
    const end = buffer.indexOf("\r\n", offset);
    if (end === -1) {
      return undefined;
    }
    const line = buffer.slice(offset, end);
    offset = end + 2;
    lines.push(line);
    if (line.length < 4 || line[3] === " ") {
      const code = Number.parseInt(line.slice(0, 3), 10);
      return {
        reply: { code: Number.isNaN(code) ? -1 : code, lines },
        rest: buffer.slice(offset),
      };
    }
  }
};

const openSocket = (options: SmtpClientOptions): Promise<Socket | TLSSocket> =>
  new Promise((resolve, reject) => {
    const target = options.address ?? options.host;
    const socket =
      options.tls === "implicit"
        ? connectTls({
            host: target,
            port: options.port,
            servername: serverName(options.host),
            rejectUnauthorized: options.verifyCertificate,
          })
        : connectTcp({ host: target, port: options.port });
    const readyEvent = options.tls === "implicit" ? "secureConnect" : "connect";
    const timer = setTimeout(
      () => {
        socket.destroy();
        reject(new SmtpConnectionError(`Timed out connecting to ${target}`));
      },
      Math.min(options.timeoutMs, options.deadlineMs),
    );
    socket.once(readyEvent, () => {
      clearTimeout(timer);
      socket.removeAllListeners("error");
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(new SmtpConnectionError(error.message));
    });
  });

const createSession = (initial: Socket | TLSSocket, timeoutMs: number) => {
  let socket = initial;
  let buffer = "";
  let failure: Error | undefined;
  let pending:
    | { resolve: (reply: SmtpReply) => void; reject: (error: Error) => void }
    | undefined;

  const deliver = () => {
    if (pending === undefined) {
      return;
    }
    const taken = takeReply(buffer);
    if (taken === undefined) {
      return;
    }
    buffer = taken.rest;
    const current = pending;
    pending = undefined;
    current.resolve(taken.reply);
  };

  const fail = (error: Error) => {
    failure ??= error;
    const current = pending;
    pending = undefined;
    current?.reject(failure);
  };

  const onData = (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    if (buffer.length > maxReplyBufferBytes) {
      fail(new SmtpConnectionError("Server reply is too long"));
      socket.destroy();
      return;
    }
    deliver();
  };
  const onError = (error: Error) =>
    fail(new SmtpConnectionError(error.message));
  const onClose = () => fail(new SmtpConnectionError("Connection closed"));
  const onTimeout = () => {
    fail(new SmtpConnectionError("Server timed out"));
    socket.destroy();
  };

  const attach = () => {
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
    socket.setTimeout(timeoutMs, onTimeout);
  };

  const detach = () => {
    socket.off("data", onData);
    socket.off("error", onError);
    socket.off("close", onClose);
    socket.setTimeout(0);
  };

  attach();

  const read = (): Promise<SmtpReply> =>
    new Promise((resolve, reject) => {
      if (failure !== undefined) {
        reject(failure);
        return;
      }
      pending = { resolve, reject };
      deliver();
    });

  return {
    read,
    command: async (line: string): Promise<SmtpReply> => {
      socket.write(`${line}\r\n`);
      return read();
    },
    send: (data: string) => {
      socket.write(data);
    },
    upgrade: async (host: string, verifyCertificate: boolean) => {
      detach();
      const secure = connectTls({
        socket,
        servername: serverName(host),
        rejectUnauthorized: verifyCertificate,
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          secure.destroy();
          reject(new SmtpConnectionError("TLS handshake timed out"));
        }, timeoutMs);
        secure.once("secureConnect", () => {
          clearTimeout(timer);
          secure.removeAllListeners("error");
          resolve();
        });
        secure.once("error", (error) => {
          clearTimeout(timer);
          secure.destroy();
          reject(new SmtpConnectionError(`TLS failed: ${error.message}`));
        });
      });
      socket = secure;
      buffer = "";
      attach();
    },
    abort: (error: Error) => {
      fail(error);
      socket.destroy();
    },
    close: () => {
      detach();
      socket.end();
      socket.destroy();
    },
  };
};

const requireReply = (reply: SmtpReply, codes: number[], step: string) => {
  if (!codes.includes(reply.code)) {
    throw new Error(`${step} failed: ${formatReply(reply)}`);
  }
};

const capabilities = (reply: SmtpReply) =>
  new Set(
    reply.lines.slice(1).map((line) => line.slice(4).trim().toUpperCase()),
  );

const authMechanisms = (caps: Set<string>) =>
  [...caps]
    .filter((cap) => cap.startsWith("AUTH ") || cap.startsWith("AUTH="))
    .flatMap((cap) => cap.slice(5).split(/\s+/));

export const sendSmtp = async (
  options: SmtpClientOptions,
  envelope: SmtpEnvelope,
): Promise<SmtpDeliveryResult> => {
  const startedAt = Date.now();
  const session = createSession(await openSocket(options), options.timeoutMs);
  const deadline = setTimeout(
    () => session.abort(new SmtpConnectionError("Delivery timed out")),
    options.deadlineMs - (Date.now() - startedAt),
  );
  try {
    const greeting = await session.read();
    if (greeting.code !== 220) {
      throw new SmtpConnectionError(
        `Greeting failed: ${formatReply(greeting)}`,
      );
    }

    let ehlo = await session.command(`EHLO ${options.heloName}`);
    if (ehlo.code !== 250) {
      requireReply(
        await session.command(`HELO ${options.heloName}`),
        [250],
        "HELO",
      );
      ehlo = { code: 250, lines: [] };
    }

    let caps = capabilities(ehlo);
    const canStartTls = caps.has("STARTTLS");
    if (options.tls === "starttls" && !canStartTls) {
      throw new SmtpConnectionError("Server does not offer STARTTLS");
    }
    if (
      canStartTls &&
      (options.tls === "starttls" || options.tls === "opportunistic")
    ) {
      requireReply(await session.command("STARTTLS"), [220], "STARTTLS");
      await session.upgrade(options.host, options.verifyCertificate);
      const secureEhlo = await session.command(`EHLO ${options.heloName}`);
      requireReply(secureEhlo, [250], "EHLO");
      caps = capabilities(secureEhlo);
    }

    if (options.auth !== undefined) {
      const { user, pass } = options.auth;
      if (authMechanisms(caps).includes("PLAIN")) {
        const token = Buffer.from(`\0${user}\0${pass}`).toString("base64");
        requireReply(
          await session.command(`AUTH PLAIN ${token}`),
          [235],
          "AUTH",
        );
      } else {
        requireReply(await session.command("AUTH LOGIN"), [334], "AUTH");
        requireReply(
          await session.command(Buffer.from(user).toString("base64")),
          [334],
          "AUTH",
        );
        requireReply(
          await session.command(Buffer.from(pass).toString("base64")),
          [235],
          "AUTH",
        );
      }
    }

    requireReply(
      await session.command(`MAIL FROM:<${envelope.from}>`),
      [250],
      "MAIL FROM",
    );

    const accepted: string[] = [];
    const rejected: SmtpDeliveryResult["rejected"] = [];
    for (const address of envelope.to) {
      const reply = await session.command(`RCPT TO:<${address}>`);
      if (reply.code === 250 || reply.code === 251) {
        accepted.push(address);
      } else {
        rejected.push({ address, error: formatReply(reply) });
      }
    }

    if (accepted.length === 0) {
      await session.command("QUIT").catch(() => undefined);
      return { accepted, rejected };
    }

    requireReply(await session.command("DATA"), [354], "DATA");
    session.send(`${dotStuff(envelope.data)}.\r\n`);
    const dataReply = await session.read();
    if (dataReply.code !== 250) {
      const error = formatReply(dataReply);
      return {
        accepted: [],
        rejected: [
          ...rejected,
          ...accepted.map((address) => ({ address, error })),
        ],
      };
    }

    await session.command("QUIT").catch(() => undefined);
    return { accepted, rejected };
  } finally {
    clearTimeout(deadline);
    session.close();
  }
};
