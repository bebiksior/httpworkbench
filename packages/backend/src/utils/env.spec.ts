import { describe, expect, test } from "vitest";
import { parseBooleanEnv } from "./env";

describe("parseBooleanEnv", () => {
  test.each(["true", "1", "yes", "y", "TRUE", "Yes"])(
    "returns true for %s",
    (value) => {
      expect(parseBooleanEnv(value)).toBe(true);
    },
  );

  test.each(["false", "0", "no", "n", "FALSE", "No"])(
    "returns false for %s",
    (value) => {
      expect(parseBooleanEnv(value)).toBe(false);
    },
  );

  test("returns undefined for undefined", () => {
    expect(parseBooleanEnv(undefined)).toBeUndefined();
  });

  test("returns undefined for unsupported values", () => {
    expect(parseBooleanEnv("maybe")).toBeUndefined();
  });
});
