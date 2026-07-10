import { afterEach, describe, expect, test, vi } from "vitest";
import { guestInstancesApi } from "./guestInstances";

const token = "a".repeat(64);
const instance = {
  id: "guest-instance",
  ownerId: "guest",
  createdAt: 1,
  webhookIds: [],
  public: false,
  locked: false,
  raw: "HTTP/1.1 200 OK\r\n\r\nok",
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("guest instance API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("sends the management token on every individual guest request", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/logs/recent?limit=100&cursor=cursor")) {
          return jsonResponse({ logs: [] });
        }
        if (init?.method === "DELETE") {
          return jsonResponse({ message: "Logs cleared" });
        }
        return jsonResponse(
          init?.method === "GET" ? { instance, logs: [] } : instance,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await guestInstancesApi.getById(instance.id, token);
    await guestInstancesApi.update(instance.id, token, { raw: instance.raw });
    await guestInstancesApi.setLocked(instance.id, token, { locked: true });
    await guestInstancesApi.clearLogs(instance.id, token);
    await guestInstancesApi.delete(instance.id, token);
    await guestInstancesApi.getOlderLogs(instance.id, token, "cursor");

    expect(fetchMock).toHaveBeenCalledTimes(6);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Headers).get("X-Guest-Token")).toBe(token);
    }
  });
});
