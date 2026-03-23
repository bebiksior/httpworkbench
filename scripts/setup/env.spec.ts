import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { getEnvFilePath, hasEnvFile, loadExistingConfig } from "./env";

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
        publicIp: undefined,
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
        publicIp: undefined,
        dnsNameservers: ["ns1.example.com", "ns2.example.com"],
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
