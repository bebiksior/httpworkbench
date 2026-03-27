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
});
