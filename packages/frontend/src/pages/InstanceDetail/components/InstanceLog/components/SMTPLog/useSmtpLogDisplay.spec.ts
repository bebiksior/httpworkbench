import { describe, expect, test } from "vitest";
import { ref } from "vue";
import { useSmtpLogDisplay } from "./useSmtpLogDisplay";

const qp = (body: string) =>
  `CLIENT: 198.51.100.10\n\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${body}`;

describe("useSmtpLogDisplay", () => {
  test("uses decoded content by default", () => {
    const raw = ref(qp("hello=20world"));
    const display = useSmtpLogDisplay(raw);

    expect(display.displayMode.value).toBe("decoded");
    expect(display.displayedRaw.value).toBe(qp("hello world"));
  });

  test("can switch back to raw content", () => {
    const raw = ref(qp("hello=20world"));
    const display = useSmtpLogDisplay(raw);

    display.setDisplayMode("raw");

    expect(display.displayMode.value).toBe("raw");
    expect(display.displayedRaw.value).toBe(qp("hello=20world"));
  });

  test("updates displayed content when the log changes", () => {
    const raw = ref(qp("hello=20world"));
    const display = useSmtpLogDisplay(raw);

    raw.value = qp("second=20message");

    expect(display.displayedRaw.value).toBe(qp("second message"));
  });
});
