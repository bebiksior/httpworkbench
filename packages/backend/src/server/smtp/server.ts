import { createServer, type Server as TcpServer, type Socket } from "node:net";
import type { Instance, Log } from "shared";
import { smtpConfig, type SmtpConfig } from "../../config";
import {
  formatSmtpLogRaw,
  maxSmtpDataBytes,
  parsePathAddress,
  parseSizeParam,
  parseSmtpCommand,
  resolveRcptInstance,
  unstuffDataDot,
  type SmtpRuntimeConfig,
} from "./utils";

const smtpIdleTimeoutMs = 30_000;
const maxSmtpBufferedBytes = maxSmtpDataBytes + 64 * 1024;
const maxSmtpRecipients = 10;
const maxSmtpCommandsPerConnection = 100;
const maxSmtpMailTransactionsPerConnection = 25;
const smtpLogWindowMs = 60_000;
const maxSmtpLogsPerWindow = 120;
const maxSmtpLogRateLimitEntries = 10_000;

type SmtpLogRateLimitEntry = {
  windowStartedAt: number;
  count: number;
};

const smtpLogRateLimit = new Map<string, SmtpLogRateLimitEntry>();

export type SmtpServerDependencies = {
  getInstanceById: (id: string) => Promise<Instance | undefined>;
  addLog: (log: Log) => Promise<Log>;
  broadcastLog: (log: Log) => void;
  createId: () => string;
  now: () => number;
};

type RunningSmtpServer = {
  port: number;
  stop: () => Promise<void>;
};

type SmtpLineResult = {
  replies: string[];
  close: boolean;
};

type AcceptedRecipient = {
  raw: string;
  instanceId: string;
};

const toRuntimeSmtpConfig = (config: SmtpConfig): SmtpRuntimeConfig => {
  if (!config.smtpEnabled) {
    throw new Error("SMTP is not enabled");
  }

  if (config.instancesDomain === "") {
    throw new Error("Instances domain is not configured");
  }

  if (config.smtpPort === undefined) {
    throw new Error("SMTP port is not configured");
  }

  return {
    instancesDomain: config.instancesDomain,
    smtpPort: config.smtpPort,
  };
};

const pruneSmtpLogRateLimit = (now: number): void => {
  for (const [key, entry] of smtpLogRateLimit) {
    if (now - entry.windowStartedAt >= smtpLogWindowMs) {
      smtpLogRateLimit.delete(key);
    }
  }

  while (smtpLogRateLimit.size > maxSmtpLogRateLimitEntries) {
    const oldestKey = smtpLogRateLimit.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }

    smtpLogRateLimit.delete(oldestKey);
  }
};

const shouldPersistSmtpLog = (params: {
  instanceId: string;
  clientAddress: string;
  now: number;
}): boolean => {
  if (smtpLogRateLimit.size >= maxSmtpLogRateLimitEntries) {
    pruneSmtpLogRateLimit(params.now);
  }

  const key = `${params.instanceId}:${params.clientAddress}`;
  const entry = smtpLogRateLimit.get(key);
  if (
    entry === undefined ||
    params.now - entry.windowStartedAt >= smtpLogWindowMs
  ) {
    smtpLogRateLimit.set(key, {
      windowStartedAt: params.now,
      count: 1,
    });
    return true;
  }

  if (entry.count >= maxSmtpLogsPerWindow) {
    return false;
  }

  entry.count += 1;
  return true;
};

const buildEhloReplies = (config: SmtpRuntimeConfig): string[] => {
  return [
    `250-${config.instancesDomain} greets you\r\n`,
    `250-SIZE ${maxSmtpDataBytes}\r\n`,
    `250-8BITMIME\r\n`,
    `250 SMTPUTF8\r\n`,
  ];
};

export const createSmtpSession = ({
  clientAddress,
  config,
  deps,
}: {
  clientAddress: string;
  config: SmtpRuntimeConfig;
  deps: SmtpServerDependencies;
}): { handleLine: (line: string) => Promise<SmtpLineResult> } => {
  let inData = false;
  let ehloName: string | undefined;
  let mailFrom: string | undefined;
  let recipients: AcceptedRecipient[] = [];
  let dataChunks: string[] = [];
  let dataBytes = 0;
  let dataTruncated = false;
  let commandCount = 0;
  let mailTransactionCount = 0;

  const resetTransaction = (): void => {
    mailFrom = undefined;
    recipients = [];
    dataChunks = [];
    dataBytes = 0;
    dataTruncated = false;
  };

  const reply = (text: string, close = false): SmtpLineResult => {
    return { replies: [`${text}\r\n`], close };
  };

  const finalizeMessage = async (): Promise<string[]> => {
    const timestamp = deps.now();
    const message = dataChunks.join("");

    for (const recipient of recipients) {
      if (
        !shouldPersistSmtpLog({
          instanceId: recipient.instanceId,
          clientAddress,
          now: timestamp,
        })
      ) {
        continue;
      }

      const log = {
        id: deps.createId(),
        instanceId: recipient.instanceId,
        type: "smtp",
        timestamp,
        address: clientAddress,
        addressVerified: true,
        raw: formatSmtpLogRaw({
          clientAddress,
          ehloName,
          mailFrom: mailFrom ?? "",
          rcptTo: recipient.raw,
          sizeBytes: dataBytes,
          truncated: dataTruncated,
          instancesDomain: config.instancesDomain,
          message,
        }),
      } satisfies Log;

      try {
        await deps.addLog(log);
        deps.broadcastLog(log);
      } catch (error) {
        console.error("Failed to persist SMTP log", error);
      }
    }

    return dataTruncated
      ? ["552 5.3.4 Message size exceeds fixed limit\r\n"]
      : ["250 2.0.0 OK: queued\r\n"];
  };

  const handleDataLine = async (line: string): Promise<SmtpLineResult> => {
    if (line === ".") {
      const replies = await finalizeMessage();
      inData = false;
      resetTransaction();
      return { replies, close: false };
    }

    const content = unstuffDataDot(line);
    const lineBytes = Buffer.byteLength(content, "utf8") + 2;

    if (dataBytes + lineBytes > maxSmtpDataBytes) {
      dataTruncated = true;
    } else {
      dataChunks.push(`${content}\r\n`);
      dataBytes += lineBytes;
    }

    return { replies: [], close: false };
  };

  const handleCommandLine = async (line: string): Promise<SmtpLineResult> => {
    commandCount += 1;
    if (commandCount > maxSmtpCommandsPerConnection) {
      return reply("421 4.7.0 Too many commands, closing connection", true);
    }

    const { verb, rest } = parseSmtpCommand(line);

    switch (verb) {
      case "EHLO": {
        ehloName = rest.trim();
        resetTransaction();
        return { replies: buildEhloReplies(config), close: false };
      }
      case "HELO": {
        ehloName = rest.trim();
        resetTransaction();
        return reply(`250 ${config.instancesDomain}`);
      }
      case "MAIL": {
        if (ehloName === undefined) {
          return reply("503 5.5.1 Send EHLO/HELO first");
        }

        const from = parsePathAddress(rest, "FROM");
        if (from === undefined) {
          return reply("501 5.5.4 Syntax: MAIL FROM:<address>");
        }

        const declaredSize = parseSizeParam(rest);
        if (declaredSize !== undefined && declaredSize > maxSmtpDataBytes) {
          return reply("552 5.3.4 Message size exceeds fixed limit");
        }

        if (mailTransactionCount >= maxSmtpMailTransactionsPerConnection) {
          return reply(
            "421 4.7.0 Too many transactions, closing connection",
            true,
          );
        }

        mailTransactionCount += 1;
        resetTransaction();
        mailFrom = from;
        return reply("250 2.1.0 OK");
      }
      case "RCPT": {
        if (mailFrom === undefined) {
          return reply("503 5.5.1 Send MAIL FROM first");
        }

        if (recipients.length >= maxSmtpRecipients) {
          return reply("452 4.5.3 Too many recipients");
        }

        const to = parsePathAddress(rest, "TO");
        if (to === undefined) {
          return reply("501 5.5.4 Syntax: RCPT TO:<address>");
        }

        const resolution = resolveRcptInstance(to, config.instancesDomain);
        if (resolution.kind === "out_of_zone") {
          return reply("550 5.7.1 Relaying denied");
        }

        if (resolution.kind !== "instance") {
          return reply("550 5.1.1 No such instance");
        }

        const instance = await deps.getInstanceById(resolution.instanceId);
        if (instance === undefined) {
          return reply("550 5.1.1 No such instance");
        }

        if (!recipients.some((entry) => entry.instanceId === instance.id)) {
          recipients.push({ raw: to, instanceId: instance.id });
        }

        return reply("250 2.1.5 OK");
      }
      case "DATA": {
        if (mailFrom === undefined) {
          return reply("503 5.5.1 Send MAIL FROM first");
        }

        if (recipients.length === 0) {
          return reply("554 5.5.1 No valid recipients");
        }

        inData = true;
        return reply("354 End data with <CR><LF>.<CR><LF>");
      }
      case "RSET": {
        resetTransaction();
        return reply("250 2.0.0 OK");
      }
      case "NOOP": {
        return reply("250 2.0.0 OK");
      }
      case "VRFY": {
        return reply("252 2.1.5 Cannot VRFY user");
      }
      case "QUIT": {
        return reply(
          `221 2.0.0 ${config.instancesDomain} closing connection`,
          true,
        );
      }
      default: {
        return reply("500 5.5.2 Command unrecognized");
      }
    }
  };

  return {
    handleLine: (line: string): Promise<SmtpLineResult> =>
      inData ? handleDataLine(line) : handleCommandLine(line),
  };
};

const createSmtpTcpServer = (
  config: SmtpRuntimeConfig,
  deps: SmtpServerDependencies,
): TcpServer => {
  return createServer((socket: Socket) => {
    const clientAddress = socket.remoteAddress ?? "";
    const session = createSmtpSession({ clientAddress, config, deps });
    const decoder = new TextDecoder();

    let pending = Buffer.alloc(0);
    let processing = false;
    let closed = false;

    socket.setTimeout(smtpIdleTimeoutMs);
    socket.on("timeout", () => {
      socket.write("421 4.4.2 Idle timeout, closing connection\r\n");
      socket.destroy();
    });

    socket.write(`220 ${config.instancesDomain} HTTP Workbench SMTP\r\n`);

    const flush = async (): Promise<void> => {
      if (processing) {
        return;
      }

      processing = true;

      try {
        while (!closed) {
          const newlineIndex = pending.indexOf(0x0a);
          if (newlineIndex === -1) {
            break;
          }

          let lineBuffer = pending.subarray(0, newlineIndex);
          pending = pending.subarray(newlineIndex + 1);

          if (
            lineBuffer.length > 0 &&
            lineBuffer[lineBuffer.length - 1] === 0x0d
          ) {
            lineBuffer = lineBuffer.subarray(0, lineBuffer.length - 1);
          }

          const line = decoder.decode(lineBuffer);
          const result = await session.handleLine(line);

          for (const replyLine of result.replies) {
            socket.write(replyLine);
          }

          if (result.close) {
            closed = true;
            socket.end();
            return;
          }
        }
      } finally {
        processing = false;
      }
    };

    socket.on("data", (chunk: Buffer) => {
      if (closed) {
        return;
      }

      if (pending.length + chunk.length > maxSmtpBufferedBytes) {
        socket.write("500 5.5.2 Line too long, closing connection\r\n");
        socket.destroy();
        return;
      }

      pending = Buffer.concat([pending, chunk]);
      void flush();
    });

    socket.on("error", (error) => {
      console.error("SMTP socket error", error);
    });
  });
};

const waitForListening = async (
  server: TcpServer,
  port: number,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
    server.listen(port, "0.0.0.0");
  });
};

const closeServer = async (server: TcpServer): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const getBoundPort = (server: TcpServer): number => {
  const addressInfo = server.address();
  if (addressInfo === null || typeof addressInfo === "string") {
    throw new Error("Failed to determine bound SMTP port");
  }

  return addressInfo.port;
};

export const createSmtpServer = async ({
  config = smtpConfig,
  deps,
}: {
  config?: SmtpConfig;
  deps: SmtpServerDependencies;
}): Promise<RunningSmtpServer> => {
  const runtimeConfig = toRuntimeSmtpConfig(config);
  const tcpServer = createSmtpTcpServer(runtimeConfig, deps);

  await waitForListening(tcpServer, runtimeConfig.smtpPort);

  const port = getBoundPort(tcpServer);

  console.log(
    `SMTP server running on port ${port} for ${runtimeConfig.instancesDomain}`,
  );

  return {
    port,
    stop: async (): Promise<void> => {
      await closeServer(tcpServer);
    },
  };
};
