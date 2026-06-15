import { describe, expect, test } from "vitest";
import { buildConfig } from "./config";

describe("frontend config", () => {
  test("falls back to instances.<domain> when instances domain is unset", () => {
    const config = buildConfig(
      {
        VITE_DOMAIN: "example.com",
      },
      "test-version",
    );

    expect(config.instancesDomain).toBe("instances.example.com");
    expect(config.getInstanceUrl("demo")).toBe(
      "https://demo.instances.example.com",
    );
  });

  test("falls back to instances.<domain> when instances domain is blank", () => {
    const config = buildConfig(
      {
        VITE_DOMAIN: "example.com",
        VITE_INSTANCES_DOMAIN: "   ",
      },
      "test-version",
    );

    expect(config.instancesDomain).toBe("instances.example.com");
    expect(config.getInstanceHost("demo")).toBe("demo.instances.example.com");
  });

  test("exposes deployment config fields without a fetch", () => {
    const config = buildConfig(
      {
        VITE_IS_HOSTED: "true",
        VITE_ALLOW_GUEST: "false",
        VITE_DNS_ENABLED: "true",
        VITE_DOMAIN: "example.com",
      },
      "test-version",
    );

    expect(config.isHosted).toBe(true);
    expect(config.allowGuest).toBe(false);
    expect(config.defaultTtlMs).toBeDefined();
    expect(config.maxTtlMs).toBeDefined();
    expect(config.maxInstancesPerOwner).toBe(100);
    expect(config.rawLimitBytes).toBe(10 * 1024 * 1024);
    expect(config.dnsEnabled).toBe(true);
  });
});
