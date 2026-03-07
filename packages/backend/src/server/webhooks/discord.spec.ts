import { describe, expect, test } from "vitest";
import type { Log } from "shared";
import {
  buildDiscordNotificationPayload,
  truncateDiscordField,
  validateDiscordWebhookUrl,
} from "./discord";

const baseLog: Log = {
  id: "log-1",
  instanceId: "instance-1",
  type: "http",
  timestamp: Date.UTC(2024, 0, 2, 3, 4, 5),
  address: "127.0.0.1",
  raw: "GET / HTTP/1.1",
};

describe("validateDiscordWebhookUrl", () => {
  test("accepts discord.com webhook urls", () => {
    expect(
      validateDiscordWebhookUrl(
        "https://discord.com/api/webhooks/123456/token-value",
      ),
    ).toEqual({ valid: true });
  });

  test("rejects non-discord hosts", () => {
    expect(
      validateDiscordWebhookUrl(
        "https://example.com/api/webhooks/123456/token-value",
      ),
    ).toEqual({
      valid: false,
      error: "URL must be a Discord webhook URL",
    });
  });

  test("rejects invalid webhook paths", () => {
    expect(
      validateDiscordWebhookUrl("https://discord.com/channels/123456/token"),
    ).toEqual({
      valid: false,
      error: "Invalid Discord webhook URL format",
    });
  });

  test("rejects invalid url strings", () => {
    expect(validateDiscordWebhookUrl("not a url")).toEqual({
      valid: false,
      error: "Invalid URL format",
    });
  });
});

describe("truncateDiscordField", () => {
  test("truncates and appends ellipsis when the value exceeds the limit", () => {
    expect(truncateDiscordField("abcdef", 5)).toBe("ab...");
  });
});

describe("buildDiscordNotificationPayload", () => {
  test("uses the HTTP color for http logs", () => {
    expect(buildDiscordNotificationPayload(baseLog).embeds[0]?.color).toBe(
      0x3b82f6,
    );
  });

  test("uses the DNS color for dns logs", () => {
    expect(
      buildDiscordNotificationPayload({
        ...baseLog,
        type: "dns",
      }).embeds[0]?.color,
    ).toBe(0x10b981);
  });

  test("emits an ISO timestamp", () => {
    expect(
      buildDiscordNotificationPayload(baseLog).embeds[0]?.fields[2]?.value,
    ).toBe("2024-01-02T03:04:05.000Z");
  });

  test("truncates raw content to fit Discord limits", () => {
    const payload = buildDiscordNotificationPayload({
      ...baseLog,
      raw: "a".repeat(2000),
    });
    const rawValue = payload.embeds[0]?.fields[3]?.value;

    expect(rawValue?.length).toBeLessThanOrEqual(1024);
    expect(rawValue?.endsWith("...\n```")).toBe(true);
  });

  test("truncates address fields to fit Discord limits", () => {
    const payload = buildDiscordNotificationPayload({
      ...baseLog,
      address: "a".repeat(2000),
    });
    const address = payload.embeds[0]?.fields[1]?.value;

    expect(address?.length).toBeLessThanOrEqual(1024);
    expect(address?.endsWith("...")).toBe(true);
  });

  test("truncates footer text to fit Discord limits", () => {
    const payload = buildDiscordNotificationPayload({
      ...baseLog,
      instanceId: "a".repeat(3000),
    });
    const footer = payload.embeds[0]?.footer.text;

    expect(footer).toBeDefined();
    expect(footer?.length).toBeLessThanOrEqual(2048);
  });
});
