import { describe, expect, test } from "vitest";
import {
  buildFinalChecklist,
  createInitialState,
  ensureConfig,
  getComposeCommand,
  getNextWizardStep,
  getStepIndex,
  shouldRestartAtCollectConfig,
} from "./flow";
import type { SetupConfig, SetupState } from "./types";

const baseConfig: SetupConfig = {
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

describe("setup flow helpers", () => {
  test("creates the initial setup state", () => {
    expect(createInitialState()).toEqual({
      version: 1,
      currentStep: "preflight",
    });
  });

  test("returns a stable step ordering", () => {
    expect(getStepIndex("preflight")).toBeLessThan(
      getStepIndex("verify-http"),
    );
    expect(getStepIndex("done")).toBeGreaterThan(getStepIndex("oauth"));
  });

  test("requires collect-config when saved config is incomplete later in the flow", () => {
    const state: SetupState = {
      version: 1,
      currentStep: "verify-http",
    };

    expect(
      shouldRestartAtCollectConfig(state, {
        ...baseConfig,
        cloudflareApiToken: undefined,
      }),
    ).toBe(true);
    expect(shouldRestartAtCollectConfig(state, baseConfig)).toBe(false);
  });

  test("computes the next wizard step based on DNS mode", () => {
    expect(getNextWizardStep("oauth", { dnsEnabled: true })).toBe(
      "verify-dns-delegation",
    );
    expect(getNextWizardStep("oauth", { dnsEnabled: false })).toBe(
      "start-stack",
    );
    expect(getNextWizardStep("verify-http", { dnsEnabled: false })).toBe(
      "done",
    );
  });

  test("builds the compose command and final checklist", () => {
    expect(getComposeCommand(true)).toContain("docker-compose.dns.yml");
    expect(getComposeCommand(false)).toBe("docker compose up -d --build");

    const checklist = buildFinalChecklist(baseConfig);
    expect(checklist).toContain("- Open https://example.com");
    expect(checklist[2]).toContain("dig <instance>.dns.example.com A");
  });

  test("throws when required config is missing", () => {
    expect(() =>
      ensureConfig(
        {
          ...baseConfig,
          dnsNameservers: [],
        },
        "start-stack",
      ),
    ).toThrow("Missing saved configuration before start-stack");
    expect(ensureConfig(baseConfig, "done")).toEqual(baseConfig);
  });
});
