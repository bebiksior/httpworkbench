import { describe, expect, test } from "vitest";
import {
  decodeQuotedPrintable,
  decodeSmtpLogQuotedPrintable,
} from "./quotedPrintable";

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

describe("decodeSmtpLogQuotedPrintable", () => {
  test("decodes the captured SMTP message while keeping the envelope raw", () => {
    const raw = [
      "CLIENT: 198.51.100.10",
      "MAIL FROM: <qp=40example.test>",
      "",
      "Subject: hi",
      "",
      "hello=20world",
    ].join("\n");

    expect(decodeSmtpLogQuotedPrintable(raw)).toBe(
      [
        "CLIENT: 198.51.100.10",
        "MAIL FROM: <qp=40example.test>",
        "",
        "Subject: hi",
        "",
        "hello world",
      ].join("\n"),
    );
  });

  test("decodes CRLF-delimited SMTP logs", () => {
    const raw = [
      "CLIENT: 198.51.100.10",
      "EHLO: mailer.test",
      "",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "hello=09world=0D=0Aagain",
    ].join("\r\n");

    expect(decodeSmtpLogQuotedPrintable(raw)).toBe(
      [
        "CLIENT: 198.51.100.10",
        "EHLO: mailer.test",
        "",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "hello\tworld\r\nagain",
      ].join("\r\n"),
    );
  });

  test("decodes the whole value when no log envelope separator exists", () => {
    expect(decodeSmtpLogQuotedPrintable("hello=20world")).toBe("hello world");
  });
});
