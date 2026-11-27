import { describe, expect, it } from "vitest";
import { formatPhoneNumber, formatWakeWindow } from "./phone";

describe("formatPhoneNumber", () => {
  it("formats US numbers and leaves others alone", () => {
    expect(formatPhoneNumber("+13305550100")).toBe("+1 (330) 555-0100");
    expect(formatPhoneNumber("+447700900123")).toBe("+447700900123");
  });
});

describe("formatWakeWindow", () => {
  it("shows a scheduled window before and during its active time", () => {
    const start = new Date(2026, 10, 27, 10, 0).getTime();
    const end = new Date(2026, 10, 27, 10, 30).getTime();
    const wake = {
      scheduled: true,
      usageWindowStart: start,
      usageWindowEnd: end,
    };
    expect(formatWakeWindow(wake, start - 1)).toBe("Awake 10:00–10:30");
    expect(formatWakeWindow(wake, start)).toBe("Awake until 10:30");
    expect(formatWakeWindow(wake, end)).toBeUndefined();
    expect(
      formatWakeWindow({ ...wake, scheduled: false }, start),
    ).toBeUndefined();
  });
});
