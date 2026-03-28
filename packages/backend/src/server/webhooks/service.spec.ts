import { afterEach, describe, expect, mock, test } from "bun:test";
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

const originalFetch = globalThis.fetch;

describe("sendDiscordNotificationThrottled", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("skips a second send to the same webhook within 1 second", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendDiscordNotificationThrottled(webhook, log);
    await sendDiscordNotificationThrottled(webhook, log);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendDiscordNotification", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("calls fetch for valid discord webhook url", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendDiscordNotification(webhook, log);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
