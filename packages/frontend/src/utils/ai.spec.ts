import { afterEach, describe, expect, test, vi } from "vitest";

const createStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => values.set(key, value),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("AI settings storage", () => {
  test("defaults AI features to enabled and keeps the legacy OpenRouter key", async () => {
    const localStorage = createStorage();
    localStorage.setItem("httpworkbench_openrouter_key", "existing-key");
    vi.stubGlobal("window", { localStorage });

    const { readAiApiKey, readAiEnabled } = await import("./ai");

    expect(readAiEnabled()).toBe(true);
    expect(readAiApiKey("openrouter")).toBe("existing-key");
  });

  test("validates subscription credentials before restoring them", async () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const { readSubscriptionCredentials, saveSubscriptionCredentials } =
      await import("./ai");

    expect(
      saveSubscriptionCredentials("xai", {
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresAt: 123,
      }),
    ).toBe(true);
    expect(readSubscriptionCredentials("xai")).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: 123,
    });

    localStorage.setItem(
      "httpworkbench.ai.xai_subscription",
      JSON.stringify({ accessToken: "" }),
    );
    expect(readSubscriptionCredentials("xai")).toBeUndefined();
  });
});
