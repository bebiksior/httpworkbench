import { describe, expect, test, vi, afterEach } from "vitest";
import type { Log, Webhook } from "shared";
import {
  sendDiscordNotificationThrottled,
  sendDiscordNotification,
} from "./service";

const webhook: Webhook = {
  id: "webhook-1",
  name: "Test",
  url: "https://discord.com/api/webhooks/123456789/token",
  ownerId: "user-1",
  createdAt: 0,
};

const log: Log = {
  id: "log-1",
  instanceId: "inst-1",
  type: "http",
  timestamp: 0,
  address: "127.0.0.1",
  raw: "GET / HTTP/1.1",
};

describe("sendDiscordNotificationThrottled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("skips a second send to the same webhook within 1 second", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendDiscordNotificationThrottled(webhook, log);
    await sendDiscordNotificationThrottled(webhook, log);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendDiscordNotification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("calls fetch for valid discord webhook url", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendDiscordNotification(webhook, log);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
