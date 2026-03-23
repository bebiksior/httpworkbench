import { createServer, type Server as TcpServer, type Socket } from "node:net";
import dgram, { type RemoteInfo, type Socket as UdpSocket } from "node:dgram";
import type { Packet } from "dns-packet";
import type { Instance, Log } from "shared";
import { dnsConfig, type DnsConfig } from "../../config";
import {
  buildDnsResponse,
  buildDnsZoneAnswers,
  decodeTcpQuery,
  decodeUdpQuery,
  DNS_RCODE,
  encodeTcpResponse,
  encodeUdpResponse,
  formatDnsLogSummary,
  parseInstanceIdFromDnsName,
  type DnsQuestion,
  type DnsRuntimeConfig,
} from "./utils";

type DnsTransport = "udp" | "tcp";

const dnsTcpIdleTimeoutMs = 10_000;
const maxDnsTcpMessageBytes = 4 * 1024;
const maxDnsTcpBufferedBytes = maxDnsTcpMessageBytes + 2;

export type DnsServerDependencies = {
  getInstanceById: (id: string) => Promise<Instance | undefined>;
  addLog: (log: Log) => Promise<Log>;
  broadcastLog: (log: Log) => void;
  createId: () => string;
  now: () => number;
};

type DnsRequestParams = {
  payload: Uint8Array;
  transport: DnsTransport;
  clientAddress: string;
  config: DnsRuntimeConfig;
  deps: DnsServerDependencies;
};

export type RunningDnsServer = {
  udpPort: number;
  tcpPort: number;
  stop: () => Promise<void>;
};

const toRuntimeDnsConfig = (config: DnsConfig): DnsRuntimeConfig => {
  if (!config.dnsEnabled) {
    throw new Error("DNS is not enabled");
  }

  if (config.dnsDomain === undefined || config.dnsDomain === "") {
    throw new Error("DNS domain is not configured");
  }

  if (config.dnsPort === undefined) {
    throw new Error("DNS port is not configured");
  }

  if (
    config.dnsNameservers === undefined ||
    config.dnsNameservers.length === 0
  ) {
    throw new Error("DNS nameservers are not configured");
  }

  return {
    dnsDomain: config.dnsDomain,
    dnsPort: config.dnsPort,
    dnsNameservers: config.dnsNameservers,
  };
};

const getFirstQuestion = (request: {
  questions?: DnsQuestion[];
}): DnsQuestion | undefined => {
  return request.questions?.[0];
};

const encodeDnsResponse = (
  transport: DnsTransport,
  response: Packet,
): Buffer => {
  return transport === "udp"
    ? encodeUdpResponse(response)
    : encodeTcpResponse(response);
};

export const handleDnsRequest = async ({
  payload,
  transport,
  clientAddress,
  config,
  deps,
}: DnsRequestParams): Promise<Buffer | undefined> => {
  try {
    const request =
      transport === "udp" ? decodeUdpQuery(payload) : decodeTcpQuery(payload);
    const question = getFirstQuestion(request);

    if (question === undefined) {
      const response = buildDnsResponse({
        request,
        code: DNS_RCODE.FORMERR,
      });

      return encodeDnsResponse(transport, response);
    }

    const resolution = parseInstanceIdFromDnsName(
      question.name,
      config.dnsDomain,
    );
    switch (resolution.kind) {
      case "zone": {
        const response = buildDnsResponse({
          request,
          code: DNS_RCODE.NOERROR,
          answers: buildDnsZoneAnswers(question, config).answers,
        });

        return encodeDnsResponse(transport, response);
      }
      case "out_of_zone": {
        const response = buildDnsResponse({
          request,
          code: DNS_RCODE.REFUSED,
        });

        return encodeDnsResponse(transport, response);
      }
      case "missing_instance": {
        const response = buildDnsResponse({
          request,
          code: DNS_RCODE.FORMERR,
        });

        return encodeDnsResponse(transport, response);
      }
      case "instance": {
        const instance = await deps.getInstanceById(resolution.instanceId);
        if (instance === undefined) {
          const response = buildDnsResponse({
            request,
            code: DNS_RCODE.NXDOMAIN,
          });

          return encodeDnsResponse(transport, response);
        }

        const log = {
          id: deps.createId(),
          instanceId: instance.id,
          type: "dns",
          timestamp: deps.now(),
          address: clientAddress,
          addressVerified: transport === "tcp",
          raw: formatDnsLogSummary({
            question,
            transport,
            dnsDomain: config.dnsDomain,
          }),
        } satisfies Log;

        await deps.addLog(log);
        deps.broadcastLog(log);

        const response = buildDnsResponse({
          request,
          code: DNS_RCODE.NOERROR,
        });

        return encodeDnsResponse(transport, response);
      }
    }
  } catch (error) {
    console.error("Failed to handle DNS request", error);
    return undefined;
  }
};

const waitForListening = async (
  udpServer: UdpSocket,
  tcpServer: TcpServer,
  port: number,
) => {
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      udpServer.once("listening", resolve);
      udpServer.once("error", reject);
      udpServer.bind(port, "0.0.0.0");
    }),
    new Promise<void>((resolve, reject) => {
      tcpServer.once("listening", resolve);
      tcpServer.once("error", reject);
      tcpServer.listen(port, "0.0.0.0");
    }),
  ]);
};

const closeServer = async (server: TcpServer | UdpSocket): Promise<void> => {
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

const getBoundPort = (server: TcpServer | UdpSocket): number => {
  const addressInfo = server.address();
  if (addressInfo === null || typeof addressInfo === "string") {
    throw new Error("Failed to determine bound DNS port");
  }

  return addressInfo.port;
};

const createTcpServer = (
  config: DnsRuntimeConfig,
  deps: DnsServerDependencies,
): TcpServer => {
  return createServer((socket: Socket) => {
    let pending = Buffer.alloc(0);
    let processing = false;

    socket.setTimeout(dnsTcpIdleTimeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
    });

    const flush = async () => {
      if (processing) {
        return;
      }

      processing = true;

      try {
        while (pending.length >= 2) {
          const length = pending.readUInt16BE(0);
          if (length === 0 || length > maxDnsTcpMessageBytes) {
            socket.destroy();
            return;
          }

          if (pending.length < length + 2) {
            break;
          }

          const message = pending.subarray(0, length + 2);
          pending = pending.subarray(length + 2);

          const response = await handleDnsRequest({
            payload: message,
            transport: "tcp",
            clientAddress: socket.remoteAddress ?? "",
            config,
            deps,
          });

          if (response !== undefined) {
            socket.write(response);
          }
        }
      } finally {
        processing = false;
        if (pending.length >= 2) {
          void flush();
        }
      }
    };

    socket.on("data", (chunk: Buffer) => {
      if (pending.length + chunk.length > maxDnsTcpBufferedBytes) {
        socket.destroy();
        return;
      }

      pending = Buffer.concat([pending, chunk]);
      void flush();
    });

    socket.on("error", (error) => {
      console.error("DNS TCP socket error", error);
    });
  });
};

const createUdpServer = (
  config: DnsRuntimeConfig,
  deps: DnsServerDependencies,
): UdpSocket => {
  const udpServer = dgram.createSocket("udp4");

  udpServer.on("message", (message: Buffer, remote: RemoteInfo) => {
    void (async () => {
      const response = await handleDnsRequest({
        payload: message,
        transport: "udp",
        clientAddress: remote.address,
        config,
        deps,
      });

      if (response === undefined) {
        return;
      }

      udpServer.send(response, remote.port, remote.address, (error) => {
        if (error !== undefined && error !== null) {
          console.error("Failed to send DNS UDP response", error);
        }
      });
    })();
  });

  udpServer.on("error", (error) => {
    console.error("DNS UDP socket error", error);
  });

  return udpServer;
};

export const createDnsServer = async ({
  config = dnsConfig,
  deps,
}: {
  config?: DnsConfig;
  deps: DnsServerDependencies;
}): Promise<RunningDnsServer> => {
  const runtimeConfig = toRuntimeDnsConfig(config);

  const udpServer = createUdpServer(runtimeConfig, deps);
  const tcpServer = createTcpServer(runtimeConfig, deps);

  await waitForListening(udpServer, tcpServer, runtimeConfig.dnsPort);

  const udpPort = getBoundPort(udpServer);
  const tcpPort = getBoundPort(tcpServer);

  console.log(
    `DNS server running on port ${udpPort} (UDP) and ${tcpPort} (TCP) for ${runtimeConfig.dnsDomain}`,
  );

  return {
    udpPort,
    tcpPort,
    stop: async () => {
      await Promise.all([closeServer(udpServer), closeServer(tcpServer)]);
    },
  };
};
