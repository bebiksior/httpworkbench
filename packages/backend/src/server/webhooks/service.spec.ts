import { afterEach, describe, expect, jest, mock, test } from "bun:test";
import type { Log, Webhook } from "shared";
import { abusePolicy } from "../../config/abuse";
import {
  flushDiscordNotificationQueue,
  queueDiscordNotification,
  resetDiscordNotificationStateForTests,
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

describe("queueDiscordNotification", () => {
  afterEach(() => {
    resetDiscordNotificationStateForTests();
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("debounces a burst and keeps HTTP visible among DNS logs", async () => {
    let requestBody = "";
    const fetchMock = mock(
      (_input: string | URL | Request, init?: { body?: unknown }) => {
        requestBody = String(init?.body ?? "");
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    jest.useFakeTimers();

    queueDiscordNotification(webhook, {
      ...log,
      id: "dns-1",
      type: "dns",
      timestamp: 1,
      raw: "A example.test",
    });
    queueDiscordNotification(webhook, {
      ...log,
      id: "http-1",
      type: "http",
      timestamp: 2,
      raw: "GET /important HTTP/1.1",
    });
    queueDiscordNotification(webhook, {
      ...log,
      id: "dns-2",
      type: "dns",
      timestamp: 3,
      raw: "AAAA example.test",
    });

    jest.advanceTimersByTime(abusePolicy.discordWebhookDebounceMs - 1);
    expect(fetchMock).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await flushDiscordNotificationQueue();
    expect(JSON.parse(requestBody)).toMatchObject({
      embeds: [
        {
          title: "HTTP Log Received (3 total)",
          fields: [
            { name: "Type", value: "HTTP" },
            { name: "Address" },
            { name: "Timestamp" },
            {
              name: "Debounced batch",
              value: "HTTP: 1\nDNS: 2",
            },
            {
              name: "Raw Content",
              value: "```\nGET /important HTTP/1.1\n```",
            },
          ],
        },
      ],
    });
  });

  test("allows at most five queued Discord batches per instance per minute", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const fixedNow = 1_700_000_000_000;
    const originalDateNow = Date.now;
    Date.now = () => fixedNow;
    try {
      for (let i = 0; i < 5; i += 1) {
        expect(
          queueDiscordNotification(
            {
              ...webhook,
              id: `webhook-${i}`,
            },
            log,
          ),
        ).toBe(true);
      }
      expect(
        queueDiscordNotification({ ...webhook, id: "webhook-extra" }, log),
      ).toBe(false);

      await flushDiscordNotificationQueue();
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      Date.now = originalDateNow;
    }
  });

  test("coalesced logs do not consume additional instance slots", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const now = 1_700_000_000_000;
    const originalDateNow = Date.now;
    Date.now = () => now;
    try {
      for (let i = 0; i < 10; i += 1) {
        expect(
          queueDiscordNotification(webhook, {
            ...log,
            id: `log-${i}`,
          }),
        ).toBe(true);
      }
      for (let i = 2; i < 6; i += 1) {
        expect(
          queueDiscordNotification({ ...webhook, id: `webhook-${i}` }, log),
        ).toBe(true);
      }
      expect(
        queueDiscordNotification({ ...webhook, id: "webhook-extra" }, log),
      ).toBe(false);

      await flushDiscordNotificationQueue();
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      Date.now = originalDateNow;
    }
  });

  test("keeps shared webhook batches separate by instance", async () => {
    const requestBodies: unknown[] = [];
    const fetchMock = mock(
      (_input: string | URL | Request, init?: { body?: unknown }) => {
        requestBodies.push(JSON.parse(String(init?.body ?? "")));
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(queueDiscordNotification(webhook, log)).toBe(true);
    expect(
      queueDiscordNotification(webhook, {
        ...log,
        id: "log-2",
        instanceId: "inst-2",
      }),
    ).toBe(true);

    await flushDiscordNotificationQueue();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          embeds: [
            expect.objectContaining({
              footer: { text: "Instance: inst-1" },
            }),
          ],
        }),
        expect.objectContaining({
          embeds: [
            expect.objectContaining({
              footer: { text: "Instance: inst-2" },
            }),
          ],
        }),
      ]),
    );
  });

  test("does not bypass an instance limit through a shared pending webhook", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const fixedNow = 1_700_000_000_000;
    const originalDateNow = Date.now;
    Date.now = () => fixedNow;
    try {
      for (let i = 0; i < 5; i += 1) {
        expect(
          queueDiscordNotification(
            { ...webhook, id: `instance-two-webhook-${i}` },
            { ...log, id: `instance-two-log-${i}`, instanceId: "inst-2" },
          ),
        ).toBe(true);
      }

      expect(queueDiscordNotification(webhook, log)).toBe(true);
      expect(
        queueDiscordNotification(webhook, {
          ...log,
          id: "instance-two-shared-log",
          instanceId: "inst-2",
        }),
      ).toBe(false);

      await flushDiscordNotificationQueue();
      expect(fetchMock).toHaveBeenCalledTimes(6);
    } finally {
      Date.now = originalDateNow;
    }
  });
});

describe("sendDiscordNotification", () => {
  afterEach(() => {
    resetDiscordNotificationStateForTests();
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
    resetDiscordNotificationStateForTests();
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
