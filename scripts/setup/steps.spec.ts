import { describe, expect, test } from "vitest";
import {
  buildPort53CheckResult,
  buildCloudflareDomainActivationInstructions,
  buildCloudflareTokenInstructions,
  buildDnsRecordsInstructions,
  buildDnsServiceInstructions,
  buildDomainSetupInstructions,
  buildGoogleOauthClientSetupInstructions,
  buildHttpVerificationInstructions,
  buildInteractionDomainInstructions,
  buildNameserverInstructions,
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
  test("builds combined DNS setup instructions", () => {
    const instructions = buildDnsRecordsInstructions(config);
    expect(instructions).toContain("example.com");
    expect(instructions).toContain("ns1.example.com");
    expect(instructions).toContain("instances.example.com");
    expect(instructions).toContain("Do not create *.instances.example.com");
    expect(instructions).toContain("203.0.113.10");
    expect(instructions).toContain("Proxied or DNS only");
    expect(instructions).toContain("Open public ports 53, 80, and 443");
  });

  test("builds service startup and onboarding instructions", () => {
    expect(buildStartServicesNote()).toContain("docker-compose.dns.yml");
    expect(buildOauthInstructions(config)).toContain(
      "https://example.com/api/auth/google/callback",
    );
    expect(buildDomainSetupInstructions()).toContain(
      "instances.yourdomain.com for interaction hosts",
    );
    expect(buildCloudflareTokenInstructions(config)).toContain(
      "Edit zone DNS template",
    );
    expect(buildInteractionDomainInstructions(config)).toContain(
      "Interaction zone:",
    );
    expect(buildInteractionDomainInstructions(config)).toContain(
      "Example hosts:",
    );
    expect(buildNameserverInstructions(config)).toContain(
      "ns1.example.com, ns2.example.com",
    );
    expect(buildCloudflareDomainActivationInstructions(config)).toContain(
      "Replace the current nameservers with the two Cloudflare nameservers.",
    );
    expect(
      buildGoogleOauthClientSetupInstructions({
        frontendUrl: "https://example.com",
      }),
    ).toContain("Create an OAuth 2.0 Client ID.");
  });

  test("builds HTTP and DNS verification instructions", () => {
    expect(buildHttpVerificationInstructions(config)).toContain(
      "https://example.com/api/health",
    );
    expect(buildHttpVerificationInstructions(config)).toContain(
      "The first request can take longer",
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

  test("builds a clear port 53 conflict result", () => {
    expect(buildPort53CheckResult(undefined)).toEqual({
      label: "Host port 53 is available",
      ok: true,
      details: "Nothing is listening on port 53.",
    });

    expect(
      buildPort53CheckResult(
        "udp   UNCONN 0      0      127.0.0.53:53      0.0.0.0:*",
      ).details,
    ).toContain("Port 53 is already in use.");
  });
});
