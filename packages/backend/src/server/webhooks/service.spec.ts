import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Log, Webhook } from "shared";
import {
  resetDiscordNotificationThrottleStateForTests,
  sendDiscordNotificationThrottled,
  sendDiscordNotification,
  sendDiscordTestNotification,
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
    resetDiscordNotificationThrottleStateForTests();
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

  test("allows at most five Discord sends per instance per minute", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const fixedNow = 1_700_000_000_000;
    const originalDateNow = Date.now;
    Date.now = () => fixedNow;
    try {
      for (let i = 0; i < 5; i += 1) {
        await sendDiscordNotificationThrottled(
          {
            ...webhook,
            id: `webhook-${i}`,
          },
          log,
        );
      }
      await sendDiscordNotificationThrottled(
        { ...webhook, id: "webhook-extra" },
        log,
      );

      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      Date.now = originalDateNow;
    }
  });

  test("does not consume a webhook slot when the instance limit rejects it", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    let now = 1_700_000_000_000;
    const originalDateNow = Date.now;
    Date.now = () => now;
    try {
      for (let i = 0; i < 5; i += 1) {
        await sendDiscordNotificationThrottled(
          { ...webhook, id: `webhook-${i}` },
          log,
        );
      }
      await sendDiscordNotificationThrottled(webhook, log);

      now += 60_000;
      await sendDiscordNotificationThrottled(webhook, log);

      expect(fetchMock).toHaveBeenCalledTimes(6);
    } finally {
      Date.now = originalDateNow;
    }
  });
});

describe("sendDiscordNotification", () => {
  afterEach(() => {
    resetDiscordNotificationThrottleStateForTests();
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

  test("includes custom webhook message content when configured", async () => {
    let requestBody = "";
    const fetchMock = mock(
      (_input: string | URL | Request, init?: { body?: unknown }) => {
        requestBody = String(init?.body ?? "");
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendDiscordNotification(
      {
        ...webhook,
        message: "<@123456> {{ text }}",
      },
      log,
    );

    expect(requestBody).not.toBe("");
    expect(JSON.parse(requestBody)).toMatchObject({
      content: "<@123456> GET / HTTP/1.1",
    });
  });

  test("sets a deadline on Discord requests", async () => {
    let signal: AbortSignal | undefined;
    const fetchMock = mock(
      (_input: string | URL | Request, init?: Parameters<typeof fetch>[1]) => {
        signal = init?.signal ?? undefined;
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendDiscordNotification(webhook, log);

    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe("sendDiscordTestNotification", () => {
  afterEach(() => {
    resetDiscordNotificationThrottleStateForTests();
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("sends a sample notification using the provided draft webhook data", async () => {
    let requestBody = "";
    const fetchMock = mock(
      (_input: string | URL | Request, init?: { body?: unknown }) => {
        requestBody = String(init?.body ?? "");
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendDiscordTestNotification({
      url: webhook.url,
      message:
        "Test {{ type }} {{ address }} {{ instanceId }} {{ timestamp }} {{ text }}",
    });

    expect(requestBody).not.toBe("");
    expect(JSON.parse(requestBody)).toMatchObject({
      content:
        "Test HTTP 203.0.113.10 example-instance 2026-04-12T12:00:00.000Z GET /example HTTP/1.1\nHost: example.httpworkbench.dev\nUser-Agent: webhook-test-button\nX-Test: true",
    });
  });

  test("bounds concurrent outbound Discord requests", async () => {
    const pendingResponses: Array<(response: Response) => void> = [];
    const fetchMock = mock(
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(resolve);
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const activeRequests = Array.from({ length: 16 }, () =>
      sendDiscordTestNotification({ url: webhook.url }),
    );
    await Bun.sleep(0);

    expect(fetchMock).toHaveBeenCalledTimes(16);
    await expect(
      sendDiscordTestNotification({ url: webhook.url }),
    ).rejects.toThrow("Discord webhook concurrency limit reached");

    for (const resolve of pendingResponses) {
      resolve(new Response(null, { status: 204 }));
    }
    await Promise.all(activeRequests);
  });
});
