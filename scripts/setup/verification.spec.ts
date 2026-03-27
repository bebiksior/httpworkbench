import { describe, expect, test } from "vitest";
import {
  buildDnsDelegationResult,
  buildDnsRecordsResult,
  buildDnsServiceResult,
  buildHttpHealthFallbackResult,
  buildHttpHealthSuccessResult,
  buildMainDnsRecordsResult,
  buildVerificationResult,
  formatRecords,
} from "./verification";
import type { SetupConfig } from "./types";

const config: SetupConfig = {
  domain: "example.com",
  frontendUrl: "https://example.com",
  serverIp: "203.0.113.10",
  instancesDomain: "instances.example.com",
  instancesAcmeChallengeDomain:
    "_acme-challenge.instances-wildcard.example.com",
  jwtSecret: "secret",
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret",
  cloudflareApiToken: "cloudflare-token",
  dnsEnabled: true,
  dnsPort: 53,
  dnsNameservers: ["ns1.example.com", "ns2.example.com"],
};

describe("setup verification helpers", () => {
  test("formats DNS records for display", () => {
    expect(
      formatRecords([
        { type: "A", host: "example.com", value: "203.0.113.10" },
        { type: "NS", host: "instances.example.com", value: "ns1.example.com" },
      ]),
    ).toContain("A    example.com");
  });

  test("builds aggregate verification status", () => {
    expect(
      buildVerificationResult([
        { label: "first", ok: true, details: "ok" },
        { label: "second", ok: false, details: "bad" },
      ]),
    ).toEqual({
      success: false,
      items: [
        { label: "first", ok: true, details: "ok" },
        { label: "second", ok: false, details: "bad" },
      ],
    });
  });

  test("evaluates main DNS records", () => {
    const result = buildMainDnsRecordsResult({
      config,
      rootRecords: ["203.0.113.10"],
    });

    expect(result.success).toBe(true);
    expect(result.items[0]?.ok).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  test("evaluates combined DNS record setup", () => {
    const result = buildDnsRecordsResult({
      config,
      rootRecords: ["203.0.113.10"],
      ns1Records: ["203.0.113.10"],
      ns2Records: ["203.0.113.10"],
      delegatedNameservers: ["ns1.example.com", "ns2.example.com"],
    });

    expect(result.success).toBe(true);
    expect(result.items).toHaveLength(4);
  });

  test("evaluates DNS delegation visibility", () => {
    const result = buildDnsDelegationResult({
      config,
      ns1Records: ["203.0.113.10"],
      ns2Records: ["203.0.113.10"],
      delegatedNameservers: ["ns1.example.com", "ns2.example.com"],
    });

    expect(result.success).toBe(true);
    expect(result.items[2]?.details).toContain("ns1.example.com");
  });

  test("builds health results for HTTPS and HTTP fallback states", () => {
    const httpsResult = buildHttpHealthSuccessResult({
      httpsUrl: "https://example.com/api/health",
      status: 200,
      body: '{"status":"ok"}',
    });
    expect(httpsResult.success).toBe(true);

    const fallbackResult = buildHttpHealthFallbackResult({
      httpsUrl: "https://example.com/api/health",
      httpUrl: "http://example.com/api/health",
      httpsError: new Error("certificate pending"),
      httpStatus: 200,
      httpBody: '{"status":"ok"}',
    });
    expect(fallbackResult.success).toBe(false);
    expect(fallbackResult.items[1]?.ok).toBe(true);
  });

  test("evaluates direct and public DNS service reachability", () => {
    const result = buildDnsServiceResult({
      config,
      directSoa: "ns1.example.com / hostmaster.instances.example.com",
      directNs: ["ns1.example.com", "ns2.example.com"],
      publicSoa: "ns1.example.com / hostmaster.instances.example.com",
    });

    expect(result.success).toBe(true);
    expect(result.items[0]?.details).toContain("Direct SOA");
  });
});
