import { createConnection } from "node:net";
import dgram from "node:dgram";
import * as dnsPacket from "dns-packet";
import type { Packet } from "dns-packet";
import { describe, expect, test } from "vitest";
import type { DnsConfig } from "../../config";
import {
  createDnsServer,
  handleDnsRequest,
  type DnsServerDependencies,
} from "./server";

const createInstance = (id: string) => ({
  id,
  ownerId: "owner-1",
  createdAt: 1,
  webhookIds: [] as string[],
  locked: false,
  kind: "static" as const,
  raw: "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
});

const createBaseDeps = () => ({
  broadcastLog: () => {},
  createId: () => "log-id",
  now: () => 123,
});

const createTestDnsConfig = (): DnsConfig => ({
  dnsEnabled: true,
  instancesDomain: "instances.example.com",
  instancesAcmeChallengeDomain:
    "_acme-challenge.instances-wildcard.example.com",
  dnsPort: 0,
  dnsNameservers: ["ns1.example.com", "ns2.example.com"],
  publicIp: "203.0.113.10",
});

const createRuntimeDnsConfig = () => ({
  instancesDomain: "instances.example.com",
  instancesAcmeChallengeDomain:
    "_acme-challenge.instances-wildcard.example.com",
  dnsPort: 53,
  dnsNameservers: ["ns1.example.com", "ns2.example.com"],
  publicIp: "203.0.113.10",
});

const sendUdpQuery = async (port: number, packet: Packet) => {
  const socket = dgram.createSocket("udp4");

  try {
    const payload = dnsPacket.encode(packet);
    const response = await new Promise<Buffer>((resolve, reject) => {
      socket.once("message", (message) => resolve(message));
      socket.once("error", reject);
      socket.send(payload, port, "127.0.0.1", (error) => {
        if (error !== undefined && error !== null) {
          reject(error);
        }
      });
    });

    return response;
  } finally {
    socket.close();
  }
};

const sendTcpQuery = async (port: number, packet: Packet) => {
  const payload = dnsPacket.streamEncode(packet);

  return await new Promise<Buffer>((resolve, reject) => {
    const socket = createConnection({ port, host: "127.0.0.1" });

    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(payload);
    });
    socket.once("data", (chunk) => {
      resolve(Buffer.from(chunk));
      socket.end();
    });
  });
};

const sendTcpQueries = async (port: number, packets: Packet[]) => {
  const payload = Buffer.concat(
    packets.map((packet) => dnsPacket.streamEncode(packet)),
  );

  return await new Promise<Buffer[]>((resolve, reject) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    const responses: Buffer[] = [];

    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(payload);
    });
    socket.on("data", (chunk) => {
      let pending = Buffer.from(chunk);

      while (pending.length >= 2) {
        const length = pending.readUInt16BE(0);
        if (pending.length < length + 2) {
          break;
        }

        responses.push(pending.subarray(0, length + 2));
        pending = pending.subarray(length + 2);
      }

      if (responses.length === packets.length) {
        socket.end();
        resolve(responses);
      }
    });
  });
};

describe("createDnsServer", () => {
  test("creates a dns log for UDP queries to an existing instance", async () => {
    const logs: Array<{ instanceId: string; raw: string; address: string }> =
      [];
    const broadcasts: string[] = [];
    const server = await createDnsServer({
      config: createTestDnsConfig(),
      deps: {
        ...createBaseDeps(),
        getInstanceById: async (id) =>
          id === "demo" ? createInstance("demo") : undefined,
        addLog: async (log) => {
          logs.push(log);
          return log;
        },
        broadcastLog: (log) => {
          broadcasts.push(log.id);
        },
        createId: () => "log-1",
        now: () => 123,
      },
    });

    try {
      const response = await sendUdpQuery(server.udpPort, {
        type: "query",
        id: 1,
        questions: [
          {
            name: "foo.demo.instances.example.com",
            type: "A",
          },
        ],
      });

      const decoded = dnsPacket.decode(response);

      expect((decoded.flags ?? 0) & 0x000f).toBe(0);
      expect(decoded.answers).toEqual([
        {
          type: "A",
          name: "foo.demo.instances.example.com",
          ttl: 60,
          class: "IN",
          flush: false,
          data: "203.0.113.10",
        },
      ]);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        instanceId: "demo",
        address: "127.0.0.1",
        addressVerified: false,
      });
      expect(logs[0]?.raw).toContain("QNAME: foo.demo.instances.example.com");
      expect(broadcasts).toEqual(["log-1"]);
    } finally {
      await server.stop();
    }
  });

  test("creates a dns log for TCP queries to an existing instance", async () => {
    const logs: string[] = [];
    const server = await createDnsServer({
      config: createTestDnsConfig(),
      deps: {
        ...createBaseDeps(),
        getInstanceById: async (id) =>
          id === "demo" ? createInstance("demo") : undefined,
        addLog: async (log) => {
          logs.push(log.raw);
          return log;
        },
      },
    });

    try {
      const response = await sendTcpQuery(server.tcpPort, {
        type: "query",
        id: 2,
        questions: [
          {
            name: "demo.instances.example.com",
            type: "AAAA",
          },
        ],
      });

      const decoded = dnsPacket.streamDecode(response);

      expect((decoded.flags ?? 0) & 0x000f).toBe(0);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain("QTYPE: AAAA");
      expect(logs[0]).toContain("TRANSPORT: TCP");
    } finally {
      await server.stop();
    }
  });

  test("returns NXDOMAIN for unknown instances without creating a log", async () => {
    const logs: string[] = [];
    const server = await createDnsServer({
      config: createTestDnsConfig(),
      deps: {
        ...createBaseDeps(),
        getInstanceById: async () => undefined,
        addLog: async (log) => {
          logs.push(log.id);
          return log;
        },
      },
    });

    try {
      const response = await sendUdpQuery(server.udpPort, {
        type: "query",
        id: 3,
        questions: [
          {
            name: "missing.instances.example.com",
            type: "A",
          },
        ],
      });

      const decoded = dnsPacket.decode(response);

      expect((decoded.flags ?? 0) & 0x000f).toBe(3);
      expect(logs).toHaveLength(0);
    } finally {
      await server.stop();
    }
  });

  test("returns the delegated ACME challenge CNAME without creating a log", async () => {
    const logs: string[] = [];
    const server = await createDnsServer({
      config: createTestDnsConfig(),
      deps: {
        ...createBaseDeps(),
        getInstanceById: async () => createInstance("demo"),
        addLog: async (log) => {
          logs.push(log.id);
          return log;
        },
      },
    });

    try {
      const response = await sendUdpQuery(server.udpPort, {
        type: "query",
        id: 31,
        questions: [
          {
            name: "_acme-challenge.instances.example.com",
            type: "TXT",
          },
        ],
      });

      const decoded = dnsPacket.decode(response);

      expect((decoded.flags ?? 0) & 0x000f).toBe(0);
      expect(decoded.answers).toEqual([
        {
          type: "CNAME",
          name: "_acme-challenge.instances.example.com",
          ttl: 60,
          class: "IN",
          flush: false,
          data: "_acme-challenge.instances-wildcard.example.com",
        },
      ]);
      expect(logs).toHaveLength(0);
    } finally {
      await server.stop();
    }
  });

  test("returns REFUSED for out of zone queries", async () => {
    const server = await createDnsServer({
      config: createTestDnsConfig(),
      deps: {
        ...createBaseDeps(),
        getInstanceById: async () => createInstance("demo"),
        addLog: async (log) => log,
      },
    });

    try {
      const response = await sendUdpQuery(server.udpPort, {
        type: "query",
        id: 4,
        questions: [
          {
            name: "demo.other.example.com",
            type: "A",
          },
        ],
      });

      const decoded = dnsPacket.decode(response);

      expect((decoded.flags ?? 0) & 0x000f).toBe(5);
    } finally {
      await server.stop();
    }
  });

  test("returns NS answers for the delegated zone apex", async () => {
    const server = await createDnsServer({
      config: createTestDnsConfig(),
      deps: {
        ...createBaseDeps(),
        getInstanceById: async () => undefined,
        addLog: async (log) => log,
      },
    });

    try {
      const response = await sendUdpQuery(server.udpPort, {
        type: "query",
        id: 5,
        questions: [
          {
            name: "instances.example.com",
            type: "NS",
          },
        ],
      });

      const decoded = dnsPacket.decode(response);

      expect(decoded.answers).toEqual([
        {
          type: "NS",
          name: "instances.example.com",
          ttl: 60,
          class: "IN",
          flush: false,
          data: "ns1.example.com",
        },
        {
          type: "NS",
          name: "instances.example.com",
          ttl: 60,
          class: "IN",
          flush: false,
          data: "ns2.example.com",
        },
      ]);
    } finally {
      await server.stop();
    }
  });

  test("handles multiple tcp queries over the same connection", async () => {
    const logs: string[] = [];
    const server = await createDnsServer({
      config: createTestDnsConfig(),
      deps: {
        ...createBaseDeps(),
        getInstanceById: async (id) =>
          id === "demo" ? createInstance("demo") : undefined,
        addLog: async (log) => {
          logs.push(log.raw);
          return log;
        },
      },
    });

    try {
      const responses = await sendTcpQueries(server.tcpPort, [
        {
          type: "query",
          id: 10,
          questions: [{ name: "demo.instances.example.com", type: "A" }],
        },
        {
          type: "query",
          id: 11,
          questions: [{ name: "demo.instances.example.com", type: "TXT" }],
        },
      ]);

      expect(responses).toHaveLength(2);
      const [firstResponse, secondResponse] = responses;

      expect(firstResponse).toBeDefined();
      expect(secondResponse).toBeDefined();

      if (firstResponse === undefined || secondResponse === undefined) {
        throw new Error("Expected two TCP DNS responses");
      }

      expect(dnsPacket.streamDecode(firstResponse).id).toBe(10);
      expect(dnsPacket.streamDecode(secondResponse).id).toBe(11);
      expect(logs).toHaveLength(2);
      expect(logs[1]).toContain("QTYPE: TXT");
    } finally {
      await server.stop();
    }
  });
});

describe("handleDnsRequest", () => {
  const deps: DnsServerDependencies = {
    ...createBaseDeps(),
    getInstanceById: async (id: string) =>
      id === "demo" ? createInstance("demo") : undefined,
    addLog: async (log) => log,
  };

  test("returns FORMERR when the packet has no questions", async () => {
    const response = await handleDnsRequest({
      payload: dnsPacket.encode({ type: "query", id: 21 }),
      transport: "udp",
      clientAddress: "127.0.0.1",
      config: createRuntimeDnsConfig(),
      deps,
    });

    expect(response).toBeDefined();

    if (response === undefined) {
      throw new Error("Expected a DNS response");
    }

    const decoded = dnsPacket.decode(response);
    expect((decoded.flags ?? 0) & 0x000f).toBe(1);
  });

  test("preserves the recursion desired flag in responses", async () => {
    const response = await handleDnsRequest({
      payload: dnsPacket.encode({
        type: "query",
        id: 22,
        flags: dnsPacket.RECURSION_DESIRED,
        questions: [{ name: "demo.instances.example.com", type: "A" }],
      }),
      transport: "udp",
      clientAddress: "127.0.0.1",
      config: createRuntimeDnsConfig(),
      deps,
    });

    expect(response).toBeDefined();

    if (response === undefined) {
      throw new Error("Expected a DNS response");
    }

    const decoded = dnsPacket.decode(response);
    expect((decoded.flags ?? 0) & dnsPacket.RECURSION_DESIRED).toBe(
      dnsPacket.RECURSION_DESIRED,
    );
  });

  test("returns an SOA answer for the delegated zone apex", async () => {
    const response = await handleDnsRequest({
      payload: dnsPacket.encode({
        type: "query",
        id: 23,
        questions: [{ name: "instances.example.com", type: "SOA" }],
      }),
      transport: "udp",
      clientAddress: "127.0.0.1",
      config: createRuntimeDnsConfig(),
      deps,
    });

    expect(response).toBeDefined();

    if (response === undefined) {
      throw new Error("Expected a DNS response");
    }

    const decoded = dnsPacket.decode(response);
    expect(decoded.answers).toEqual([
      {
        type: "SOA",
        name: "instances.example.com",
        ttl: 60,
        class: "IN",
        flush: false,
        data: {
          mname: "ns1.example.com",
          rname: "hostmaster.instances.example.com",
          serial: 1,
          refresh: 3600,
          retry: 600,
          expire: 86400,
          minimum: 60,
        },
      },
    ]);
  });

  test("returns the delegated ACME challenge CNAME before instance parsing", async () => {
    const response = await handleDnsRequest({
      payload: dnsPacket.encode({
        type: "query",
        id: 25,
        questions: [
          { name: "_acme-challenge.instances.example.com", type: "CNAME" },
        ],
      }),
      transport: "udp",
      clientAddress: "127.0.0.1",
      config: createRuntimeDnsConfig(),
      deps: {
        ...deps,
        addLog: async (log) => {
          throw new Error(`Unexpected DNS log for ${log.instanceId}`);
        },
      },
    });

    expect(response).toBeDefined();

    if (response === undefined) {
      throw new Error("Expected a DNS response");
    }

    const decoded = dnsPacket.decode(response);
    expect(decoded.answers).toEqual([
      {
        type: "CNAME",
        name: "_acme-challenge.instances.example.com",
        ttl: 60,
        class: "IN",
        flush: false,
        data: "_acme-challenge.instances-wildcard.example.com",
      },
    ]);
  });

  test("returns undefined for malformed dns packets", async () => {
    const response = await handleDnsRequest({
      payload: new Uint8Array([1, 2, 3]),
      transport: "udp",
      clientAddress: "127.0.0.1",
      config: createRuntimeDnsConfig(),
      deps,
    });

    expect(response).toBeUndefined();
  });

  test("marks TCP source addresses as verified", async () => {
    let capturedAddressVerified: boolean | undefined;

    await handleDnsRequest({
      payload: dnsPacket.streamEncode({
        type: "query",
        id: 24,
        questions: [{ name: "demo.instances.example.com", type: "A" }],
      }),
      transport: "tcp",
      clientAddress: "127.0.0.1",
      config: createRuntimeDnsConfig(),
      deps: {
        ...deps,
        addLog: async (log) => {
          capturedAddressVerified = log.addressVerified;
          return log;
        },
      },
    });

    expect(capturedAddressVerified).toBe(true);
  });
});
