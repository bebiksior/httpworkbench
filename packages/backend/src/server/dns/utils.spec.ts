import * as dnsPacket from "dns-packet";
import { describe, expect, test } from "vitest";
import {
  buildDnsResponse,
  buildDnsZoneAnswers,
  DNS_RCODE,
  formatDnsLogSummary,
  parseInstanceIdFromDnsName,
} from "./utils";

describe("parseInstanceIdFromDnsName", () => {
  test("extracts the instance id from a delegated dns zone", () => {
    expect(
      parseInstanceIdFromDnsName("demo.dns.example.com", "dns.example.com"),
    ).toEqual({
      kind: "instance",
      instanceId: "demo",
    });
  });

  test("uses the last label before the delegated zone as the instance id", () => {
    expect(
      parseInstanceIdFromDnsName(
        "foo.bar.demo.dns.example.com",
        "dns.example.com",
      ),
    ).toEqual({
      kind: "instance",
      instanceId: "demo",
    });
  });

  test("recognizes the zone apex", () => {
    expect(
      parseInstanceIdFromDnsName("dns.example.com", "dns.example.com"),
    ).toEqual({
      kind: "zone",
    });
  });

  test("returns out_of_zone for names outside the delegated zone", () => {
    expect(
      parseInstanceIdFromDnsName("demo.example.com", "dns.example.com"),
    ).toEqual({
      kind: "out_of_zone",
    });
  });
});

describe("formatDnsLogSummary", () => {
  test("formats a normalized dns log summary", () => {
    expect(
      formatDnsLogSummary({
        question: {
          name: "Demo.DNS.Example.com.",
          type: "A",
          class: "IN",
        },
        transport: "udp",
        dnsDomain: "dns.example.com",
      }),
    ).toBe(
      [
        "QNAME: demo.dns.example.com",
        "QTYPE: A",
        "QCLASS: IN",
        "TRANSPORT: UDP",
        "ZONE: dns.example.com",
      ].join("\n"),
    );
  });
});

describe("buildDnsZoneAnswers", () => {
  test("returns NS records for the delegated zone apex", () => {
    expect(
      buildDnsZoneAnswers(
        {
          name: "dns.example.com",
          type: "NS",
        },
        {
          dnsDomain: "dns.example.com",
          dnsPort: 53,
          dnsNameservers: ["ns1.example.com", "ns2.example.com"],
        },
      ).answers,
    ).toEqual([
      {
        type: "NS",
        name: "dns.example.com",
        ttl: 60,
        data: "ns1.example.com",
      },
      {
        type: "NS",
        name: "dns.example.com",
        ttl: 60,
        data: "ns2.example.com",
      },
    ]);
  });
});

describe("buildDnsResponse", () => {
  test("encodes the authoritative response code", () => {
    const encoded = dnsPacket.encode(
      buildDnsResponse({
        request: {
          id: 7,
          questions: [
            {
              name: "demo.dns.example.com",
              type: "A",
            },
          ],
        },
        code: DNS_RCODE.NXDOMAIN,
      }),
    );

    const decoded = dnsPacket.decode(encoded);
    expect(decoded.type).toBe("response");
    expect((decoded.flags ?? 0) & dnsPacket.AUTHORITATIVE_ANSWER).toBeTruthy();
    expect((decoded.flags ?? 0) & 0x000f).toBe(DNS_RCODE.NXDOMAIN);
  });
});
