import { describe, expect, test } from "vitest";
import {
  buildCloudflareTokenInstructions,
  buildDnsDelegationInstructions,
  buildDnsServiceInstructions,
  buildDomainSetupInstructions,
  buildGoogleOauthClientSetupInstructions,
  buildHttpVerificationInstructions,
  buildInteractionDomainInstructions,
  buildMainDnsVerificationInstructions,
  buildOauthInstructions,
  buildServerIpInstructions,
  buildStartServicesNote,
  getSuggestedServerIp,
} from "./steps";
import type { SetupConfig, SetupState } from "./types";

const config: SetupConfig = {
  domain: "example.com",
  frontendUrl: "https://example.com",
  serverIp: "203.0.113.10",
  publicIp: "203.0.113.10",
  instancesDomain: "instances.example.com",
  jwtSecret: "secret",
  caddyAskSecret: "ask-secret",
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret",
  cloudflareApiToken: "cloudflare-token",
  dnsEnabled: true,
  dnsPort: 53,
  dnsNameservers: ["ns1.example.com", "ns2.example.com"],
};

describe("setup step helpers", () => {
  test("builds main DNS verification instructions", () => {
    const instructions = buildMainDnsVerificationInstructions(config);
    expect(instructions).toContain("ns1.example.com");
    expect(instructions).toContain("Do not create a wildcard A record");
    expect(instructions).toContain("203.0.113.10");
  });

  test("builds DNS delegation instructions", () => {
    const instructions = buildDnsDelegationInstructions(config);
    expect(instructions).toContain("instances.example.com");
    expect(instructions).toContain("bypass Cloudflare");
    expect(instructions).toContain("Public ports 80 and 443");
    expect(instructions).toContain("Open public UDP and TCP port 53");
  });

  test("builds service startup and onboarding instructions", () => {
    expect(buildStartServicesNote()).toContain("docker-compose.dns.yml");
    expect(buildOauthInstructions(config)).toContain(
      "https://example.com/api/auth/google/callback",
    );
    expect(buildDomainSetupInstructions()).toContain(
      "NS instances.yourdomain.com",
    );
    expect(buildCloudflareTokenInstructions(config)).toContain("on-demand TLS");
    expect(buildInteractionDomainInstructions(config)).toContain(
      "both HTTP and DNS logging",
    );
    expect(buildInteractionDomainInstructions(config)).toContain(
      "terminate HTTPS directly",
    );
    expect(
      buildGoogleOauthClientSetupInstructions({
        frontendUrl: "https://example.com",
      }),
    ).toContain("Create an OAuth 2.0 Client ID");
  });

  test("builds HTTP and DNS verification instructions", () => {
    expect(buildHttpVerificationInstructions(config)).toContain(
      "https://example.com/api/health",
    );
    expect(buildHttpVerificationInstructions(config)).toContain(
      "keeps renewal automatic",
    );
    expect(buildDnsServiceInstructions(config)).toContain(
      "dig demo.instances.example.com A",
    );
  });

  test("uses the detected server IP as the suggested default", () => {
    const state: SetupState = {
      version: 1,
      currentStep: "collect-config",
      detectedServerIp: "203.0.113.10",
    };

    expect(getSuggestedServerIp({}, state)).toBe("203.0.113.10");
    expect(getSuggestedServerIp({ serverIp: "198.51.100.12" }, undefined)).toBe(
      "198.51.100.12",
    );
    expect(buildServerIpInstructions(state)).toContain("Detected public IPv4");
  });
});
