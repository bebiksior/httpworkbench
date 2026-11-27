import { describe, expect, it } from "vitest";
import { formatPhoneNumber, formatWakeWindow } from "./phone";

describe("formatPhoneNumber", () => {
  it("formats US numbers and leaves others alone", () => {
    expect(formatPhoneNumber("+13305550100")).toBe("+1 (330) 555-0100");
    expect(formatPhoneNumber("+447700900123")).toBe("+447700900123");
  });
});

describe("formatWakeWindow", () => {
  it("shows the start only while it is still ahead", () => {
    const end = new Date(2026, 10, 27, 10, 30).getTime();
    expect(formatWakeWindow(undefined, end)).toBe("Awake until 10:30");
    expect(formatWakeWindow(Date.now() + 3_600_000, end)).toMatch(
      /^Awake \d\d:\d\d–10:30$/,
    );
  });
});
