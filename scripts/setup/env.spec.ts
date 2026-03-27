import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildEnvFileContent,
  getEnvFilePath,
  hasEnvFile,
  loadExistingConfig,
} from "./env";

describe("setup env helpers", () => {
  test("loads safely when .env does not exist", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "httpworkbench-setup-"));

    try {
      expect(hasEnvFile(tempDir)).toBe(false);
      expect(getEnvFilePath(tempDir)).toBe(path.join(tempDir, ".env"));
      expect(loadExistingConfig(tempDir)).toEqual({
        domain: "",
        frontendUrl: undefined,
        instancesDomain: "",
        instancesAcmeChallengeDomain: "",
        serverIp: undefined,
        jwtSecret: undefined,
        googleClientId: undefined,
        googleClientSecret: undefined,
        cloudflareApiToken: undefined,
        dnsEnabled: false,
        dnsPort: 53,
        dnsNameservers: [],
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("falls back to https://domain when FRONTEND_URL is missing", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "httpworkbench-setup-"));

    try {
      writeFileSync(
        getEnvFilePath(tempDir),
        ["DOMAIN=example.com", "DNS_ENABLED=true"].join("\n"),
      );

      expect(hasEnvFile(tempDir)).toBe(true);
      expect(loadExistingConfig(tempDir)).toMatchObject({
        domain: "example.com",
        frontendUrl: "https://example.com",
        instancesDomain: "instances.example.com",
        instancesAcmeChallengeDomain:
          "_acme-challenge.instances-wildcard.example.com",
        dnsEnabled: true,
        serverIp: undefined,
        dnsNameservers: ["ns1.example.com", "ns2.example.com"],
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("writes only the env keys used by the current setup flow", () => {
    const content = buildEnvFileContent({
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
    });

    expect(content).toContain("PUBLIC_IP=203.0.113.10");
    expect(content).toContain("CLOUDFLARE_API_TOKEN=cloudflare-token");
    expect(content).toContain("IS_HOSTED=false");
    expect(content).not.toContain("AUTO_HTTPS=");
    expect(content).not.toContain("TLS_MAIN_DIRECTIVE=");
    expect(content).not.toContain("TLS_WILDCARD_DIRECTIVE=");
  });
});
