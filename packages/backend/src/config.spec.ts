import { describe, expect, test } from "vitest";
import { buildDnsConfig } from "./config";

describe("buildDnsConfig", () => {
  test("returns dns disabled by default", () => {
    expect(buildDnsConfig({ DOMAIN: "example.com" })).toEqual({
      dnsEnabled: false,
      instancesDomain: "instances.example.com",
      instancesAcmeChallengeDomain:
        "_acme-challenge.instances-wildcard.example.com",
    });
  });

  test("uses the default delegated instances zone and nameservers when enabled", () => {
    expect(
      buildDnsConfig({
        DOMAIN: "example.com",
        DNS_ENABLED: "true",
        PUBLIC_IP: "203.0.113.10",
      }),
    ).toEqual({
      dnsEnabled: true,
      instancesDomain: "instances.example.com",
      instancesAcmeChallengeDomain:
        "_acme-challenge.instances-wildcard.example.com",
      dnsPort: 53,
      dnsNameservers: ["ns1.example.com", "ns2.example.com"],
      publicIp: "203.0.113.10",
    });
  });

  test("respects explicit dns settings", () => {
    expect(
      buildDnsConfig({
        DOMAIN: "example.com",
        DNS_ENABLED: "1",
        INSTANCES_DOMAIN: "interact.example.net.",
        INSTANCES_ACME_CHALLENGE_DOMAIN:
          "_acme-challenge.custom-validation.example.org.",
        DNS_PORT: "5300",
        DNS_NAMESERVERS: "ns-a.example.net, ns-b.example.net",
        PUBLIC_IP: "198.51.100.20",
      }),
    ).toEqual({
      dnsEnabled: true,
      instancesDomain: "interact.example.net",
      instancesAcmeChallengeDomain:
        "_acme-challenge.custom-validation.example.org",
      dnsPort: 5300,
      dnsNameservers: ["ns-a.example.net", "ns-b.example.net"],
      publicIp: "198.51.100.20",
    });
  });
});
