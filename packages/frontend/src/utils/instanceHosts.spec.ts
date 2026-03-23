import { describe, expect, test } from "vitest";
import { getDnsInstanceHost } from "./instanceHosts";

describe("getDnsInstanceHost", () => {
  test("returns a dns hostname when a dns domain is configured", () => {
    expect(getDnsInstanceHost("demo", "dns.example.com")).toBe(
      "demo.dns.example.com",
    );
  });

  test("returns undefined when the dns domain is missing", () => {
    expect(getDnsInstanceHost("demo", undefined)).toBeUndefined();
  });

  test("returns undefined when the dns domain is empty", () => {
    expect(getDnsInstanceHost("demo", "")).toBeUndefined();
  });
});
