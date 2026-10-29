import { describe, expect, test } from "vitest";
import { buildPublicConfig, resolveInstancesDomain } from "./config";

describe("buildPublicConfig", () => {
  test("builds the public config for hosted deployments", () => {
    expect(
      buildPublicConfig({
        IS_HOSTED: "true",
        ALLOW_GUEST: "false",
        DNS_ENABLED: "true",
        SMTP_ENABLED: "true",
        DOMAIN: "example.com",
      }),
    ).toEqual({
      authMode: "google",
      isHosted: true,
      allowGuest: false,
      defaultTtlMs: 14 * 24 * 60 * 60 * 1000,
      maxTtlMs: 30 * 24 * 60 * 60 * 1000,
      maxInstancesPerOwner: 300,
      rawLimitBytes: 10 * 1024 * 1024,
      dnsEnabled: true,
      smtpEnabled: true,
      instancesDomain: "instances.example.com",
    });
  });

  test("uses localhost defaults when domain input is absent", () => {
    expect(
      buildPublicConfig({
        DNS_ENABLED: "false",
      }),
    ).toEqual({
      authMode: "google",
      isHosted: false,
      allowGuest: false,
      defaultTtlMs: undefined,
      maxTtlMs: undefined,
      maxInstancesPerOwner: undefined,
      rawLimitBytes: 10 * 1024 * 1024,
      dnsEnabled: false,
      smtpEnabled: false,
      instancesDomain: "instances.localhost",
    });
  });

  test("selects password login and rejects invalid authentication modes", () => {
    expect(buildPublicConfig({ AUTH_MODE: "password" }).authMode).toBe(
      "password",
    );
    expect(() => buildPublicConfig({ AUTH_MODE: "disabled" })).toThrow();
  });
});

describe("resolveInstancesDomain", () => {
  test("normalizes explicit instances domains", () => {
    expect(
      resolveInstancesDomain({
        DOMAIN: "example.com",
        INSTANCES_DOMAIN: "Interact.Example.net.",
      }),
    ).toBe("interact.example.net");
  });
});
