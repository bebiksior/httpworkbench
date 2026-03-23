import * as dnsPacket from "dns-packet";
import { describe, expect, test } from "vitest";
import {
  buildDnsAcmeChallengeAnswers,
  buildDnsInstanceAnswers,
  buildDnsResponse,
  buildDnsZoneAnswers,
  DNS_RCODE,
  formatDnsLogSummary,
  parseInstanceIdFromDnsName,
} from "./utils";

describe("parseInstanceIdFromDnsName", () => {
  test("extracts the instance id from the instances zone", () => {
    expect(
      parseInstanceIdFromDnsName(
        "demo.instances.example.com",
        "instances.example.com",
      ),
    ).toEqual({
      kind: "instance",
      instanceId: "demo",
    });
  });

  test("uses the last label before the delegated zone as the instance id", () => {
    expect(
      parseInstanceIdFromDnsName(
        "foo.bar.demo.instances.example.com",
        "instances.example.com",
      ),
    ).toEqual({
      kind: "instance",
      instanceId: "demo",
    });
  });

  test("recognizes the zone apex", () => {
    expect(
      parseInstanceIdFromDnsName(
        "instances.example.com",
        "instances.example.com",
      ),
    ).toEqual({
      kind: "zone",
    });
  });

  test("returns out_of_zone for names outside the delegated zone", () => {
    expect(
      parseInstanceIdFromDnsName("demo.example.com", "instances.example.com"),
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
          name: "Demo.Instances.Example.com.",
          type: "A",
          class: "IN",
        },
        transport: "udp",
        instancesDomain: "instances.example.com",
      }),
    ).toBe(
      [
        "QNAME: demo.instances.example.com",
        "QTYPE: A",
        "QCLASS: IN",
        "TRANSPORT: UDP",
        "ZONE: instances.example.com",
      ].join("\n"),
    );
  });
});

describe("buildDnsZoneAnswers", () => {
  test("returns NS records for the delegated zone apex", () => {
    expect(
      buildDnsZoneAnswers(
        {
          name: "instances.example.com",
          type: "NS",
        },
        {
          instancesDomain: "instances.example.com",
          instancesAcmeChallengeDomain:
            "_acme-challenge.instances-wildcard.example.com",
          dnsPort: 53,
          dnsNameservers: ["ns1.example.com", "ns2.example.com"],
          publicIp: "203.0.113.10",
        },
      ).answers,
    ).toEqual([
      {
        type: "NS",
        name: "instances.example.com",
        ttl: 60,
        data: "ns1.example.com",
      },
      {
        type: "NS",
        name: "instances.example.com",
        ttl: 60,
        data: "ns2.example.com",
      },
    ]);
  });
});

describe("buildDnsAcmeChallengeAnswers", () => {
  test("returns a CNAME answer for the delegated ACME challenge hostname", () => {
    expect(
      buildDnsAcmeChallengeAnswers(
        {
          name: "_acme-challenge.instances.example.com",
          type: "TXT",
        },
        {
          instancesDomain: "instances.example.com",
          instancesAcmeChallengeDomain:
            "_acme-challenge.instances-wildcard.example.com",
          dnsPort: 53,
          dnsNameservers: ["ns1.example.com", "ns2.example.com"],
          publicIp: "203.0.113.10",
        },
      ).answers,
    ).toEqual([
      {
        type: "CNAME",
        name: "_acme-challenge.instances.example.com",
        ttl: 60,
        data: "_acme-challenge.instances-wildcard.example.com",
      },
    ]);
  });
});

describe("buildDnsInstanceAnswers", () => {
  test("returns an A answer for a known instance hostname", () => {
    expect(
      buildDnsInstanceAnswers(
        {
          name: "demo.instances.example.com",
          type: "A",
        },
        {
          instancesDomain: "instances.example.com",
          instancesAcmeChallengeDomain:
            "_acme-challenge.instances-wildcard.example.com",
          dnsPort: 53,
          dnsNameservers: ["ns1.example.com", "ns2.example.com"],
          publicIp: "203.0.113.10",
        },
      ).answers,
    ).toEqual([
      {
        type: "A",
        name: "demo.instances.example.com",
        ttl: 60,
        data: "203.0.113.10",
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
              name: "demo.instances.example.com",
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
