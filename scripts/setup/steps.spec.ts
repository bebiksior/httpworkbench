import { describe, expect, test } from "vitest";
import {
  buildDnsDelegationInstructions,
  buildDnsServiceInstructions,
  buildHttpVerificationInstructions,
  buildMainDnsVerificationInstructions,
  buildOauthInstructions,
  buildStartServicesNote,
} from "./steps";
import type { SetupConfig } from "./types";

const config: SetupConfig = {
  domain: "example.com",
  frontendUrl: "https://example.com",
  serverIp: "203.0.113.10",
  jwtSecret: "secret",
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret",
  cloudflareApiToken: "cloudflare-token",
  dnsEnabled: true,
  dnsDomain: "dns.example.com",
  dnsPort: 53,
  dnsNameservers: ["ns1.example.com", "ns2.example.com"],
};

describe("setup step helpers", () => {
  test("builds main DNS verification instructions", () => {
    const instructions = buildMainDnsVerificationInstructions(config);
    expect(instructions).toContain("*.instances.example.com");
    expect(instructions).toContain("203.0.113.10");
  });

  test("builds DNS delegation instructions", () => {
    const instructions = buildDnsDelegationInstructions(config);
    expect(instructions).toContain("dns.example.com");
    expect(instructions).toContain("Open public UDP and TCP port 53");
  });

  test("builds service startup and oauth instructions", () => {
    expect(buildStartServicesNote(true)).toContain("docker-compose.dns.yml");
    expect(buildOauthInstructions(config)).toContain(
      "https://example.com/api/auth/google/callback",
    );
  });

  test("builds HTTP and DNS verification instructions", () => {
    expect(buildHttpVerificationInstructions(config)).toContain(
      "https://example.com/api/health",
    );
    expect(buildDnsServiceInstructions(config)).toContain("ns1.example.com");
  });
});
