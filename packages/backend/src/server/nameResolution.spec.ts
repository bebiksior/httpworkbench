import { describe, expect, test } from "vitest";
import { normalizeHostname, resolveInstanceName } from "./nameResolution";

describe("normalizeHostname", () => {
  test("normalizes case, trailing dots, and host ports", () => {
    expect(normalizeHostname("Demo.Instances.Example.com.:443")).toBe(
      "demo.instances.example.com",
    );
  });

  test("normalizes bracketed IPv6 style host values", () => {
    expect(normalizeHostname("[Demo.Instances.Example.com]:8443")).toBe(
      "demo.instances.example.com",
    );
  });
});

describe("resolveInstanceName", () => {
  test("recognizes the delegated zone apex", () => {
    expect(
      resolveInstanceName("instances.example.com", "instances.example.com"),
    ).toEqual({ kind: "zone" });
  });

  test("extracts the last label before the delegated zone as the instance id", () => {
    expect(
      resolveInstanceName(
        "x.y.demo.instances.example.com",
        "instances.example.com",
      ),
    ).toEqual({
      kind: "instance",
      instanceId: "demo",
    });
  });

  test("returns out_of_zone for names outside the delegated zone", () => {
    expect(
      resolveInstanceName("demo.other.example.com", "instances.example.com"),
    ).toEqual({ kind: "out_of_zone" });
  });
});
