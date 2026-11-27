import { describe, expect, test } from "bun:test";
import { PhoneProviderError } from "./provider";
import { createTextverifiedProvider } from "./textverified";

const base = "https://www.textverified.com";

type Handler = (request: Request) => Response | undefined | Promise<Response>;

const json = (body: unknown, status = 200) => Response.json(body, { status });

const page = (data: unknown[], next?: string) => ({
  data,
  hasNext: next !== undefined,
  hasPrevious: false,
  count: data.length,
  links: {
    current: { href: null, method: "GET" },
    previous: null,
    next: next === undefined ? null : { href: next, method: "GET" },
  },
});

const stubFetch = (...handlers: Handler[]) => {
  const requests: Request[] = [];
  const fetchStub = (async (
    input: string | URL,
    init?: ConstructorParameters<typeof Request>[1],
  ) => {
    const request = new Request(input.toString(), init);
    requests.push(request);
    for (const handler of handlers) {
      const response = await handler(request);
      if (response !== undefined) return response;
    }
    if (new URL(request.url).pathname === "/api/pub/v2/auth") {
      return json({
        token: "eyJtest",
        expiresIn: 900,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      });
    }
    return json({ error: "unexpected" }, 500);
  }) as typeof fetch;
  return { fetchStub, requests };
};

const provider = (fetchStub: typeof fetch) =>
  createTextverifiedProvider(
    { username: "user@example.com", apiKey: "key-123" },
    { fetch: fetchStub, sleep: async () => undefined },
  );

const rental = (id: string, number: string, state = "renewableActive") => ({
  id,
  number,
  state,
  alwaysOn: id !== "lr_sleepy",
  serviceName: "allservices",
});

const route =
  (method: string, path: string, response: () => Response): Handler =>
  (request) => {
    const url = new URL(request.url);
    return request.method === method && `${url.pathname}${url.search}` === path
      ? response()
      : undefined;
  };

describe("Textverified provider", () => {
  test("lists active rentals across pages with notes, as E.164", async () => {
    const { fetchStub, requests } = stubFetch(
      route("GET", "/api/pub/v2/reservations/rental/renewable", () =>
        json(
          page(
            [rental("lr_one", "3305550100")],
            `${base}/api/pub/v2/reservations/rental/renewable?page=2`,
          ),
        ),
      ),
      route("GET", "/api/pub/v2/reservations/rental/renewable?page=2", () =>
        json(
          page([
            rental("lr_sleepy", "3155550100"),
            rental("lr_old", "2125550100", "renewableExpired"),
          ]),
        ),
      ),
      route("GET", "/api/pub/v2/reservations/rental/nonrenewable", () =>
        json(page([])),
      ),
      route("GET", "/api/pub/v2/reservations/rental/lr_one/user-notes", () =>
        json({ reservationId: "lr_one", userNotes: "example.com admin" }),
      ),
      route("GET", "/api/pub/v2/reservations/rental/lr_sleepy/user-notes", () =>
        json({ reservationId: "lr_sleepy", userNotes: "" }),
      ),
    );

    const phones = await provider(fetchStub).listPhones();

    expect(phones).toEqual([
      {
        id: "lr_one",
        number: "+13305550100",
        notes: "example.com admin",
        state: "renewableActive",
        alwaysOn: true,
      },
      {
        id: "lr_sleepy",
        number: "+13155550100",
        notes: undefined,
        state: "renewableActive",
        alwaysOn: false,
      },
    ]);
    const auths = requests.filter((request) =>
      request.url.endsWith("/api/pub/v2/auth"),
    );
    expect(auths).toHaveLength(1);
    expect(auths[0]?.method).toBe("POST");
    expect(auths[0]?.headers.get("x-api-username")).toBe("user@example.com");
    expect(auths[0]?.headers.get("x-api-key")).toBe("key-123");
    expect(auths[0]?.headers.get("content-length")).toBe("0");
    for (const request of requests) {
      expect(request.redirect).toBe("manual");
      expect(request.headers.get("user-agent")).toMatch(/^httpworkbench\//);
    }
    expect(
      requests
        .filter((request) => !request.url.endsWith("/auth"))
        .every(
          (request) =>
            request.headers.get("authorization") === "Bearer eyJtest",
        ),
    ).toBe(true);
  });

  test("maps SMS and retries throttled requests", async () => {
    let throttled = 0;
    const { fetchStub } = stubFetch((request) => {
      if (!request.url.includes("/api/pub/v2/sms?reservationId=lr_one")) {
        return undefined;
      }
      if (throttled < 2) {
        throttled += 1;
        return json({}, 429);
      }
      return json(
        page([
          {
            id: "sms_2",
            from: "12345",
            to: "3305550100",
            createdAt: "2026-11-27T10:00:00Z",
            smsContent: "Your code is 123456",
            parsedCode: "123456",
            encrypted: false,
          },
          {
            id: "sms_1",
            from: null,
            to: "3305550100",
            createdAt: "2026-11-27T09:00:00Z",
            smsContent: null,
            parsedCode: null,
            encrypted: true,
          },
        ]),
      );
    });

    const messages = await provider(fetchStub).listSms(
      { id: "lr_one", number: "+13305550100", state: "", alwaysOn: true },
      1,
    );

    expect(throttled).toBe(2);
    expect(messages).toEqual([
      {
        id: "sms_2",
        from: "12345",
        to: "+13305550100",
        timestamp: Date.parse("2026-11-27T10:00:00Z"),
        text: "Your code is 123456",
        parsedCode: "123456",
      },
    ]);
  });

  test("wakes a line and returns its usage window", async () => {
    const { fetchStub, requests } = stubFetch(
      route("POST", "/api/pub/v2/wake-requests", () =>
        json(
          { href: `${base}/api/pub/v2/wake-requests/wr_1`, method: "GET" },
          201,
        ),
      ),
      route("GET", "/api/pub/v2/wake-requests/wr_1", () =>
        json({
          id: "wr_1",
          isScheduled: true,
          reservationId: "lr_sleepy",
          usageWindowStart: "2026-11-27T10:00:00Z",
          usageWindowEnd: "2026-11-27T10:30:00Z",
        }),
      ),
    );

    const wake = await provider(fetchStub).wake({
      id: "lr_sleepy",
      number: "+13155550100",
      state: "renewableActive",
      alwaysOn: false,
    });

    expect(wake).toEqual({
      scheduled: true,
      usageWindowStart: Date.parse("2026-11-27T10:00:00Z"),
      usageWindowEnd: Date.parse("2026-11-27T10:30:00Z"),
    });
    const created = requests.find((request) =>
      request.url.endsWith("/wake-requests"),
    );
    expect(await created?.json()).toEqual({ reservationId: "lr_sleepy" });
  });

  test("never follows links to another host", async () => {
    const { fetchStub, requests } = stubFetch(
      route("GET", "/api/pub/v2/reservations/rental/renewable", () =>
        json(page([], "https://evil.example/steal")),
      ),
      route("GET", "/api/pub/v2/reservations/rental/nonrenewable", () =>
        json(page([])),
      ),
    );

    await expect(provider(fetchStub).listPhones()).rejects.toThrow(
      "unexpected link",
    );
    expect(requests.some((request) => request.url.includes("evil"))).toBe(
      false,
    );
  });

  test.each([401, 429, 503])(
    "does not replay a wake POST on HTTP %i",
    async (status) => {
      const { fetchStub, requests } = stubFetch(
        route("POST", "/api/pub/v2/wake-requests", () => json({}, status)),
      );
      await expect(
        provider(fetchStub).wake(rental("lr_sleepy", "3305550100")),
      ).rejects.toThrow(`HTTP ${status}`);
      expect(
        requests.filter((request) => request.url.endsWith("/wake-requests")),
      ).toHaveLength(1);
    },
  );

  test("refreshes an expired session once despite a delayed unauthorized response", async () => {
    const renewed = Promise.withResolvers<void>();
    let auths = 0;
    const { fetchStub } = stubFetch((request) => {
      if (request.url.endsWith("/auth")) {
        return json({ token: `token-${++auths}`, expiresIn: 900 });
      }
      if (request.headers.get("authorization") === "Bearer token-1") {
        if (request.url.endsWith("/nonrenewable")) {
          return renewed.promise.then(() => json({}, 401));
        }
        return json({}, 401);
      }
      renewed.resolve();
      return json(page([]));
    });
    await expect(provider(fetchStub).listPhones()).resolves.toEqual([]);
    expect(auths).toBe(2);
  });

  test("uses a replacement token after its refresh margin", async () => {
    let auths = 0;
    let now = 0;
    const { fetchStub } = stubFetch((request) =>
      request.url.endsWith("/auth")
        ? json({ token: `token-${++auths}`, expiresIn: 900 })
        : json(page([])),
    );
    const client = createTextverifiedProvider(
      { username: "user", apiKey: "key" },
      { fetch: fetchStub, now: () => now },
    );
    await client.listPhones();
    now += 800_000;
    await client.listPhones();
    expect(auths).toBe(1);
    now += 100_000;
    await client.listPhones();
    expect(auths).toBe(2);
  });

  test("paginates through archived rentals beyond twenty pages", async () => {
    const { fetchStub } = stubFetch((request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/renewable")) {
        const current = Number(url.searchParams.get("page") ?? "1");
        return current < 21
          ? json(
              page(
                [rental("expired", "3305550100", "renewableExpired")],
                `?page=${current + 1}`,
              ),
            )
          : json(page([rental("active", "3305550100")]));
      }
      if (url.pathname.endsWith("/user-notes")) return json({ userNotes: "" });
      if (url.pathname.endsWith("/nonrenewable")) return json(page([]));
    });
    const phones = await provider(fetchStub).listPhones();
    expect(phones.map((phone) => phone.id)).toEqual(["active"]);
  });

  test("reads the oldest unseen SMS batch across pages with equal timestamps", async () => {
    const when = new Date(1700000000000);
    const sms = (id: string) => ({
      id,
      to: "3305550100",
      createdAt: when.toISOString(),
    });
    const { fetchStub, requests } = stubFetch(
      route("GET", "/api/pub/v2/sms?reservationId=lr_one", () =>
        json(page(["6", "5", "4"].map(sms), "?reservationId=lr_one&page=2")),
      ),
      route("GET", "/api/pub/v2/sms?reservationId=lr_one&page=2", () =>
        json(page(["3", "2", "1"].map(sms), "?reservationId=lr_one&page=3")),
      ),
    );
    const client = provider(fetchStub);
    const phone = rental("lr_one", "3305550100");
    const first = await client.listSms(phone, 2, {
      id: "2",
      at: when.getTime(),
    });
    expect(first.map((message) => message.id)).toEqual(["4", "3"]);
    const rest = await client.listSms(phone, 2, {
      id: "4",
      at: when.getTime(),
    });
    expect(rest.map((message) => message.id)).toEqual(["6", "5"]);
    expect(requests.some((request) => request.url.includes("page=3"))).toBe(
      false,
    );
  });

  test("aborts in-flight cursor pagination without retrying", async () => {
    const controller = new AbortController();
    const inFlight = Promise.withResolvers<void>();
    const { fetchStub, requests } = stubFetch((request) => {
      if (request.url.endsWith("/auth")) return undefined;
      if (request.url.endsWith("page=2")) {
        inFlight.resolve();
        return new Promise<Response>((_, reject) =>
          request.signal.addEventListener(
            "abort",
            () => reject(request.signal.reason),
            { once: true },
          ),
        );
      }
      return json(page([], "?reservationId=lr_one&page=2"));
    });
    const read = provider(fetchStub).listSms(
      rental("lr_one", "3305550100"),
      20,
      { id: "old", at: 0 },
      controller.signal,
    );
    await inFlight.promise;
    controller.abort(new Error("watch ended"));
    await expect(read).rejects.toThrow("watch ended");
    expect(
      requests.filter((request) => request.url.endsWith("page=2")),
    ).toHaveLength(1);
  });

  test("updates nonrenewable notes on a fresh client using the listed phone", async () => {
    const { fetchStub } = stubFetch(
      route(
        "POST",
        "/api/pub/v2/reservations/rental/nonrenewable/lr_one",
        () => new Response(null, { status: 204 }),
      ),
    );
    await provider(fetchStub).setNotes(
      rental("lr_one", "3305550100", "nonrenewableActive"),
      "note",
    );
  });

  test("keeps malformed sign-in response content out of provider errors", async () => {
    const { fetchStub } = stubFetch(
      route(
        "POST",
        "/api/pub/v2/auth",
        () => new Response("private credential value"),
      ),
    );
    await expect(provider(fetchStub).listPhones()).rejects.toThrow(
      "Textverified returned an invalid response",
    );
  });

  test("reports rejected credentials as a client error", async () => {
    const fetchStub = (async () =>
      new Response("", { status: 401 })) as unknown as typeof fetch;

    const error = await provider(fetchStub)
      .listPhones()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PhoneProviderError);
    expect(error).toMatchObject({
      status: 400,
      message: "Textverified rejected the username or API key",
    });
  });
});
