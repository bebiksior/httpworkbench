import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Elysia } from "elysia";

process.env.JWT_SECRET = "phones-test-secret";
process.env.DOMAIN = "test.local";

type FakeSms = {
  id: string;
  from: string;
  to: string;
  createdAt: string;
  smsContent: string;
  parsedCode: string | null;
  encrypted: boolean;
};

type FakeAccount = {
  username: string;
  rentals: { id: string; number: string; alwaysOn: boolean; notes: string }[];
  sms: Record<string, FakeSms[]>;
};

const accounts = new Map<string, FakeAccount>();
const realFetch = globalThis.fetch;

const page = (data: unknown[]) => ({
  data,
  hasNext: false,
  hasPrevious: false,
  count: data.length,
  links: { current: null, previous: null, next: null },
});

const fakeTextverified = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname === "/api/pub/v2/auth") {
    const key = request.headers.get("x-api-key") ?? "";
    const account = accounts.get(key);
    return account?.username === request.headers.get("x-api-username")
      ? Response.json({
          token: `tok_${key}`,
          expiresIn: 900,
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        })
      : new Response("", { status: 401 });
  }
  const token = request.headers
    .get("authorization")
    ?.replace("Bearer tok_", "");
  const account = accounts.get(token ?? "");
  if (account === undefined) {
    return new Response("", { status: 401 });
  }
  const rentalPath = url.pathname.match(
    /^\/api\/pub\/v2\/reservations\/rental\/(?:renewable\/)?([^/]+)(\/user-notes)?$/,
  );
  if (url.pathname === "/api/pub/v2/reservations/rental/renewable") {
    return Response.json(
      page(
        account.rentals.map((rental) => ({
          ...rental,
          state: "renewableActive",
        })),
      ),
    );
  }
  if (url.pathname === "/api/pub/v2/reservations/rental/nonrenewable") {
    return Response.json(page([]));
  }
  if (url.pathname === "/api/pub/v2/sms") {
    const id = url.searchParams.get("reservationId") ?? "";
    return Response.json(page([...(account.sms[id] ?? [])].reverse()));
  }
  if (rentalPath !== null) {
    const rental = account.rentals.find((entry) => entry.id === rentalPath[1]);
    if (rental === undefined) {
      return new Response("", { status: 404 });
    }
    if (request.method === "POST") {
      rental.notes = (
        (await request.json()) as { userNotes: string }
      ).userNotes;
      return new Response("");
    }
    return Response.json({ reservationId: rental.id, userNotes: rental.notes });
  }
  return new Response("", { status: 404 });
};

const addSms = (account: FakeAccount, rentalId: string, text: string) => {
  const list = (account.sms[rentalId] ??= []);
  list.push({
    id: `sms_${rentalId}_${list.length + 1}`,
    from: "22000",
    to: account.rentals.find((rental) => rental.id === rentalId)?.number ?? "",
    createdAt: new Date().toISOString(),
    smsContent: text,
    parsedCode: text.match(/\d{6}/)?.[0] ?? null,
    encrypted: false,
  });
};

const [
  { addUser, closeDb, getDb, initDb },
  { issueAuthToken },
  { createApiKeyForUser },
  { phonesRoutes },
  { closeMcpHandler, handleMcpRequest },
] = await Promise.all([
  import("../../storage"),
  import("../auth"),
  import("../apiKeyAuth"),
  import("../api/phones"),
  import("../mcp"),
]);

const app = new Elysia().use(phonesRoutes);

const call = async (
  userId: string,
  pathName: string,
  method = "GET",
  body?: unknown,
) =>
  app.handle(
    new Request(`http://localhost${pathName}`, {
      method,
      headers: {
        authorization: `Bearer ${await issueAuthToken(userId)}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

const saveTextverified = (userId: string, username: string, apiKey: string) =>
  call(userId, "/api/phone-providers", "POST", {
    provider: "textverified",
    credentials: { username, apiKey },
  });

type ToolResult = {
  isError?: boolean;
  content?: { text?: string }[];
  structuredContent?: Record<string, unknown>;
};

const connectMcp = async (userId: string, scopes?: string[]) => {
  const apiKey = createApiKeyForUser({
    userId,
    name: "MCP phones",
    scopes: scopes as Parameters<typeof createApiKeyForUser>[0]["scopes"],
  }).secret;
  const transport = new StreamableHTTPClientTransport(
    new URL("http://test.local/mcp"),
    {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set("host", "test.local");
        return handleMcpRequest(
          new Request(url.toString(), { ...init, headers }),
        );
      },
    },
  );
  const client = new Client(
    { name: "test", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(transport);
  return {
    client,
    call: async (name: string, args: Record<string, unknown> = {}) =>
      (await client.callTool({ name, arguments: args })) as ToolResult,
  };
};

describe("phones", () => {
  let dataDir = "";
  let alice: FakeAccount;
  let bob: FakeAccount;

  beforeAll(() => {
    globalThis.fetch = (async (
      input: string | URL,
      init?: ConstructorParameters<typeof Request>[1],
    ) =>
      fakeTextverified(
        new Request(input.toString(), init),
      )) as unknown as typeof fetch;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await closeMcpHandler();
  });

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-phones-"));
    initDb({ dataDir, reset: true });
    addUser({ id: "alice", googleId: "google-a", createdAt: 1 });
    addUser({ id: "bob", googleId: "google-b", createdAt: 1 });
    accounts.clear();
    alice = {
      username: "alice@example.com",
      rentals: [
        { id: "lr_alice", number: "3305550100", alwaysOn: true, notes: "" },
      ],
      sms: {},
    };
    bob = {
      username: "bob@example.com",
      rentals: [
        { id: "lr_bob", number: "3155550100", alwaysOn: false, notes: "" },
      ],
      sms: {},
    };
    accounts.set("alice-key-0001", alice);
    accounts.set("bob-key-0002", bob);
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("stores credentials encrypted and only returns them masked", async () => {
    const saved = await saveTextverified(
      "alice",
      "alice@example.com",
      "alice-key-0001",
    );
    expect(saved.status).toBe(201);
    expect(await saved.json()).toMatchObject({
      provider: "textverified",
      credentials: { username: "alice@example.com", apiKey: "••••0001" },
    });

    const listed = await (await call("alice", "/api/phone-providers")).json();
    expect(JSON.stringify(listed)).not.toContain("alice-key-0001");
    const stored = getDb()
      .$client.query<{ credentialsCiphertext: string }, []>(
        "SELECT credentialsCiphertext FROM phoneProviders",
      )
      .get();
    expect(stored?.credentialsCiphertext).not.toContain("alice-key");
    expect(stored?.credentialsCiphertext).not.toContain("alice@example.com");

    const tested = await call(
      "alice",
      "/api/phone-providers/textverified/test",
      "POST",
    );
    expect(await tested.json()).toEqual({ phoneCount: 1 });
  });

  test("rejects credentials the provider refuses", async () => {
    const saved = await saveTextverified("alice", "alice@example.com", "wrong");
    expect(saved.status).toBe(400);
    expect(await (await call("alice", "/api/phone-providers")).json()).toEqual(
      [],
    );
  });

  test("keeps each user's numbers and SMS to that user", async () => {
    await saveTextverified("alice", "alice@example.com", "alice-key-0001");
    await saveTextverified("bob", "bob@example.com", "bob-key-0002");
    addSms(alice, "lr_alice", "Alice code 111111");

    const alicePhones = await (await call("alice", "/api/phones")).json();
    expect(alicePhones).toEqual([
      {
        id: "lr_alice",
        provider: "textverified",
        number: "+13305550100",
        state: "renewableActive",
        alwaysOn: true,
      },
    ]);
    const bobPhones = (await (await call("bob", "/api/phones")).json()) as {
      id: string;
    }[];
    expect(bobPhones.map((phone) => phone.id)).toEqual(["lr_bob"]);

    expect((await call("bob", "/api/phones/lr_alice/sms")).status).toBe(404);
    expect(
      (await call("bob", "/api/phones/lr_alice", "PATCH", { notes: "x" }))
        .status,
    ).toBe(404);
    const aliceSms = (await (
      await call("alice", "/api/phones/lr_alice/sms")
    ).json()) as { messages: { parsedCode?: string }[] };
    expect(aliceSms.messages.map((sms) => sms.parsedCode)).toEqual(["111111"]);

    const bobMcp = await connectMcp("bob");
    try {
      const sms = await bobMcp.call("list_sms", { phoneId: "lr_alice" });
      expect(sms.isError).toBe(true);
      const phones = await bobMcp.call("list_phones");
      expect(JSON.stringify(phones.structuredContent)).not.toContain(
        "lr_alice",
      );
    } finally {
      await bobMcp.client.close();
    }
  });

  test("updates notes with the provider", async () => {
    await saveTextverified("alice", "alice@example.com", "alice-key-0001");

    const updated = await call("alice", "/api/phones/lr_alice", "PATCH", {
      notes: "example.com admin",
    });

    expect(await updated.json()).toMatchObject({ notes: "example.com admin" });
    expect(alice.rentals[0]?.notes).toBe("example.com admin");
    expect(await (await call("alice", "/api/phones")).json()).toMatchObject([
      { notes: "example.com admin" },
    ]);
  });

  test("forgets numbers when the provider is removed", async () => {
    await saveTextverified("alice", "alice@example.com", "alice-key-0001");
    expect(
      (await call("alice", "/api/phone-providers/textverified", "DELETE"))
        .status,
    ).toBe(200);
    const phones = await call("alice", "/api/phones");
    expect(phones.status).toBe(409);
  });

  test("tells agents when no provider is configured", async () => {
    const mcp = await connectMcp("alice");
    try {
      const phones = await mcp.call("list_phones");
      expect(phones.isError).toBe(true);
      expect(phones.content?.[0]?.text).toContain(
        "No phone provider configured",
      );
    } finally {
      await mcp.client.close();
    }
  });

  test("requires phone scopes", async () => {
    await saveTextverified("alice", "alice@example.com", "alice-key-0001");
    const mcp = await connectMcp("alice", ["mailboxes:read"]);
    try {
      const phones = await mcp.call("list_phones");
      expect(phones.isError).toBe(true);
    } finally {
      await mcp.client.close();
    }
  });

  test(
    "watch_phone waits for new SMS and resumes from its cursor",
    async () => {
      await saveTextverified("alice", "alice@example.com", "alice-key-0001");
      addSms(alice, "lr_alice", "Old code 000000");
      const mcp = await connectMcp("alice");
      try {
        const watching = mcp.call("watch_phone", { phoneId: "lr_alice" });
        await Bun.sleep(300);
        addSms(alice, "lr_alice", "Your code is 123456");

        const watched = await watching;
        const messages = watched.structuredContent?.messages as {
          parsedCode?: string;
        }[];
        expect(messages.map((sms) => sms.parsedCode)).toEqual(["123456"]);
        expect(watched.structuredContent?.pollAfterMs).toBe(1000);

        addSms(alice, "lr_alice", "Next code 654321");
        const resumed = await mcp.call("watch_phone", {
          phoneId: "lr_alice",
          cursor: watched.structuredContent?.resumeCursor,
        });
        expect(
          (
            resumed.structuredContent?.messages as { parsedCode?: string }[]
          ).map((sms) => sms.parsedCode),
        ).toEqual(["654321"]);
      } finally {
        await mcp.client.close();
      }
    },
    { timeout: 15_000 },
  );
});
