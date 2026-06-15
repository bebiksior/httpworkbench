import { describe, expect, test } from "vitest";
import { buildPublicConfig, resolveInstancesDomain } from "./config";

describe("buildPublicConfig", () => {
  test("builds the public config for hosted deployments", () => {
    expect(
      buildPublicConfig({
        IS_HOSTED: "true",
        ALLOW_GUEST: "false",
        DNS_ENABLED: "true",
        DOMAIN: "example.com",
      }),
    ).toEqual({
      isHosted: true,
      allowGuest: false,
      defaultTtlMs: 14 * 24 * 60 * 60 * 1000,
      maxTtlMs: 30 * 24 * 60 * 60 * 1000,
      maxInstancesPerOwner: 100,
      rawLimitBytes: 10 * 1024 * 1024,
      dnsEnabled: true,
      instancesDomain: "instances.example.com",
    });
  });

  test("uses localhost defaults when domain input is absent", () => {
    expect(
      buildPublicConfig({
        DNS_ENABLED: "false",
      }),
    ).toEqual({
      isHosted: false,
      allowGuest: false,
      defaultTtlMs: undefined,
      maxTtlMs: undefined,
      maxInstancesPerOwner: undefined,
      rawLimitBytes: 10 * 1024 * 1024,
      dnsEnabled: false,
      instancesDomain: "instances.localhost",
    });
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
