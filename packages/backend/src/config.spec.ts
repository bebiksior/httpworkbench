import { describe, expect, test } from "bun:test";
import { parseSmtpRelayUrl, resolveMailRelay } from "./config";

describe("parseSmtpRelayUrl", () => {
  test("parses STARTTLS and implicit TLS relays", () => {
    expect(
      parseSmtpRelayUrl("smtp://user%40x.com:p%3Ass@smtp.example.com"),
    ).toEqual({
      name: "smtp.example.com",
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "user@x.com", pass: "p:ss" },
    });
    expect(parseSmtpRelayUrl("smtps://relay.example.com:2465")).toEqual({
      name: "relay.example.com",
      host: "relay.example.com",
      port: 2465,
      secure: true,
      auth: undefined,
    });
  });

  test("ignores blank values and rejects other schemes", () => {
    expect(parseSmtpRelayUrl(" ")).toBeUndefined();
    expect(() => parseSmtpRelayUrl("https://smtp.example.com")).toThrow();
  });
});

describe("resolveMailRelay", () => {
  test("uses SMTP2GO over port 2525 with STARTTLS", () => {
    expect(
      resolveMailRelay({
        SMTP2GO_USERNAME: "user",
        SMTP2GO_PASSWORD: "secret",
      }),
    ).toEqual({
      name: "SMTP2GO",
      host: "mail.smtp2go.com",
      port: 2525,
      secure: false,
      auth: { user: "user", pass: "secret" },
    });
  });

  test("sends directly when no relay is configured", () => {
    expect(resolveMailRelay({})).toBeUndefined();
  });

  test("rejects partial or conflicting relay settings", () => {
    expect(() => resolveMailRelay({ SMTP2GO_USERNAME: "user" })).toThrow();
    expect(() =>
      resolveMailRelay({
        SMTP2GO_USERNAME: "user",
        SMTP2GO_PASSWORD: "secret",
        SMTP_RELAY_URL: "smtp://relay.example.com",
      }),
    ).toThrow();
  });
});
