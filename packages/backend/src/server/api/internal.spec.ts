import { afterEach, describe, expect, test, vi, type Mock } from "vitest";

vi.mock("../../storage/repositories/instances", () => ({
  getInstanceById: vi.fn(),
}));

const setRuntimeEnv = (key: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
    if (typeof Bun !== "undefined") {
      delete Bun.env[key];
    }
    return;
  }

  process.env[key] = value;
  if (typeof Bun !== "undefined") {
    Bun.env[key] = value;
  }
};

setRuntimeEnv("INSTANCES_DOMAIN", "instances.example.com");

const loadRoute = async () => {
  return await import("./internal");
};

const getMockedInstanceLookup = async () => {
  const module = await import("../../storage/repositories/instances");
  return module.getInstanceById as Mock;
};

describe("INTERNAL_ROUTES", () => {
  afterEach(() => {
    setRuntimeEnv("CADDY_ASK_SECRET", undefined);
    vi.clearAllMocks();
  });

  test("approves on-demand tls for an existing instance under the delegated zone", async () => {
    setRuntimeEnv("CADDY_ASK_SECRET", "test-secret");
    const { INTERNAL_ROUTES } = await loadRoute();
    const getInstanceById = await getMockedInstanceLookup();
    getInstanceById.mockResolvedValue({
      id: "demo",
      ownerId: "owner-1",
      createdAt: 1,
      webhookIds: [],
      locked: false,
      kind: "static",
      raw: "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
    });

    const response = await INTERNAL_ROUTES["/api/internal/tls/allow"].GET(
      new Request(
        "http://localhost/api/internal/tls/allow?domain=demo.instances.example.com&token=test-secret",
      ) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(getInstanceById).toHaveBeenCalledWith("demo");
  });

  test("rejects requests with an invalid ask token", async () => {
    setRuntimeEnv("CADDY_ASK_SECRET", "expected-secret");
    const { INTERNAL_ROUTES } = await loadRoute();

    const response = await INTERNAL_ROUTES["/api/internal/tls/allow"].GET(
      new Request(
        "http://localhost/api/internal/tls/allow?domain=demo.instances.example.com&token=wrong-secret",
      ) as never,
    );

    expect(response.status).toBe(403);
  });

  test("rejects hosts outside the delegated zone", async () => {
    setRuntimeEnv("CADDY_ASK_SECRET", "test-secret");
    const { INTERNAL_ROUTES } = await loadRoute();

    const response = await INTERNAL_ROUTES["/api/internal/tls/allow"].GET(
      new Request(
        "http://localhost/api/internal/tls/allow?domain=demo.api.example.com&token=test-secret",
      ) as never,
    );

    expect(response.status).toBe(403);
  });

  test("rejects unknown instances under the delegated zone", async () => {
    setRuntimeEnv("CADDY_ASK_SECRET", "test-secret");
    const { INTERNAL_ROUTES } = await loadRoute();
    const getInstanceById = await getMockedInstanceLookup();
    getInstanceById.mockResolvedValue(undefined);

    const response = await INTERNAL_ROUTES["/api/internal/tls/allow"].GET(
      new Request(
        "http://localhost/api/internal/tls/allow?domain=missing.instances.example.com&token=test-secret",
      ) as never,
    );

    expect(response.status).toBe(403);
    expect(getInstanceById).toHaveBeenCalledWith("missing");
  });
});
