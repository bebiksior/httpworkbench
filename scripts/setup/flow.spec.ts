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

describe("setup flow helpers", () => {
  test("creates the initial setup state", () => {
    expect(createInitialState()).toEqual({
      version: 1,
      currentStep: "preflight",
    });
  });

  test("returns a stable step ordering", () => {
    expect(getStepIndex("preflight")).toBeLessThan(getStepIndex("verify-http"));
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
        caddyAskSecret: undefined,
      }),
    ).toBe(true);
    expect(shouldRestartAtCollectConfig(state, baseConfig)).toBe(false);
  });

  test("computes the next wizard step for the mandatory interaction flow", () => {
    expect(getNextWizardStep("collect-config")).toBe("verify-dns-records");
    expect(getNextWizardStep("verify-dns-records")).toBe("oauth");
    expect(getNextWizardStep("oauth")).toBe("start-stack");
    expect(getNextWizardStep("verify-http")).toBe("verify-dns-service");
  });

  test("always uses the DNS compose override and updated interaction checklist", () => {
    expect(getComposeCommand()).toContain("docker-compose.dns.yml");

    const checklist = buildFinalChecklist(baseConfig);
    expect(checklist).toContain("- Open https://example.com");
    expect(checklist[1]).toContain("<instance>.instances.example.com");
    expect(checklist[2]).toContain("dig <instance>.instances.example.com A");
    expect(checklist[3]).toContain(
      "curl https://<instance>.instances.example.com",
    );
  });

  test("throws when required config is missing", () => {
    expect(() =>
      ensureConfig(
        {
          ...baseConfig,
          dnsEnabled: false,
        },
        "start-stack",
      ),
    ).toThrow("Missing saved configuration before start-stack");
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
