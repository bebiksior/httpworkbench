import { describe, expect, test } from "vitest";
import { ref } from "vue";
import {
  getNextSmtpLogDisplayMode,
  useSmtpLogDisplay,
} from "./useSmtpLogDisplay";

describe("getNextSmtpLogDisplayMode", () => {
  test("toggles between decoded and raw", () => {
    expect(getNextSmtpLogDisplayMode("decoded")).toBe("raw");
    expect(getNextSmtpLogDisplayMode("raw")).toBe("decoded");
  });
});

describe("useSmtpLogDisplay", () => {
  test("uses decoded content by default", () => {
    const raw = ref("hello=20world");
    const display = useSmtpLogDisplay(raw);

    expect(display.displayMode.value).toBe("decoded");
    expect(display.displayedRaw.value).toBe("hello world");
  });

  test("can switch back to raw content", () => {
    const raw = ref("hello=20world");
    const display = useSmtpLogDisplay(raw);

    display.setDisplayMode("raw");

    expect(display.displayMode.value).toBe("raw");
    expect(display.displayedRaw.value).toBe("hello=20world");
  });

  test("updates displayed content when the log changes", () => {
    const raw = ref("hello=20world");
    const display = useSmtpLogDisplay(raw);

    raw.value = "second=20message";

    expect(display.displayedRaw.value).toBe("second message");
  });
});
