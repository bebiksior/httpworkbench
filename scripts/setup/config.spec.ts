import { describe, expect, test } from "vitest";
import {
  buildDefaultInstancesDomain,
  buildDefaultNameservers,
  formatNameservers,
  isValidDomain,
  isValidIpv4,
  normalizeDomain,
  normalizeNameservers,
} from "./config";

describe("setup config helpers", () => {
  test("normalizes domains from user input", () => {
    expect(normalizeDomain("https://Example.COM/path")).toBe("example.com");
  });

  test("builds delegated dns defaults", () => {
    expect(buildDefaultInstancesDomain("example.com")).toBe(
      "instances.example.com",
    );
    expect(buildDefaultNameservers("example.com")).toEqual([
      "ns1.example.com",
      "ns2.example.com",
    ]);
  });

  test("normalizes nameserver lists", () => {
    expect(
      normalizeNameservers("NS1.Example.com, ns2.example.com., ,"),
    ).toEqual(["ns1.example.com", "ns2.example.com"]);
    expect(formatNameservers(["ns1.example.com", "ns2.example.com"])).toBe(
      "ns1.example.com,ns2.example.com",
    );
  });

  test("validates domains and IPv4 addresses", () => {
    expect(isValidDomain("example.com")).toBe(true);
    expect(isValidDomain("bad domain")).toBe(false);
    expect(isValidIpv4("203.0.113.10")).toBe(true);
    expect(isValidIpv4("999.0.0.1")).toBe(false);
  });
});
