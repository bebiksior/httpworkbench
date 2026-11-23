import { describe, expect, test } from "vitest";
import { decodeQuotedPrintable } from "./quotedPrintable";

describe("decodeQuotedPrintable", () => {
  test("decodes uppercase and lowercase hexadecimal octets", () => {
    expect(decodeQuotedPrintable("hello=20world=21=0atest")).toBe(
      "hello world!\ntest",
    );
  });

  test("decodes UTF-8 byte sequences", () => {
    expect(decodeQuotedPrintable("caf=C3=A9")).toBe("caf\u00e9");
  });

  test("leaves regular Unicode characters intact", () => {
    expect(decodeQuotedPrintable("plain \u2603 text")).toBe(
      "plain \u2603 text",
    );
  });

  test("removes soft line breaks", () => {
    expect(decodeQuotedPrintable("hello=\r\nworld=\nagain")).toBe(
      "helloworldagain",
    );
  });

  test("preserves malformed escape sequences", () => {
    expect(decodeQuotedPrintable("a=xy b= c= q=\rstill")).toBe(
      "a=xy b= c= q=\rstill",
    );
  });
});
