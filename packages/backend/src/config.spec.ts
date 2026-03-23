import { describe, expect, test } from "vitest";
import { buildDnsConfig } from "./config";

describe("buildDnsConfig", () => {
  test("returns dns disabled by default", () => {
    expect(buildDnsConfig({ DOMAIN: "example.com" })).toEqual({
      dnsEnabled: false,
    });
  });

  test("uses the default delegated dns zone and nameservers when enabled", () => {
    expect(
      buildDnsConfig({
        DOMAIN: "example.com",
        DNS_ENABLED: "true",
      }),
    ).toEqual({
      dnsEnabled: true,
      dnsDomain: "dns.example.com",
      dnsPort: 53,
      dnsNameservers: ["ns1.example.com", "ns2.example.com"],
    });
  });

  test("respects explicit dns settings", () => {
    expect(
      buildDnsConfig({
        DOMAIN: "example.com",
        DNS_ENABLED: "1",
        DNS_DOMAIN: "queries.example.net.",
        DNS_PORT: "5300",
        DNS_NAMESERVERS: "ns-a.example.net, ns-b.example.net",
      }),
    ).toEqual({
      dnsEnabled: true,
      dnsDomain: "queries.example.net",
      dnsPort: 5300,
      dnsNameservers: ["ns-a.example.net", "ns-b.example.net"],
    });
  });
});
