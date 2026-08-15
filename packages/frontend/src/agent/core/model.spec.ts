import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ModelItem } from "@/agent/types/config";
import type { AiProviderId } from "@/utils/ai";

const mocks = vi.hoisted(() => ({
  anthropicModel: vi.fn((modelId: string) => ({
    provider: "anthropic",
    modelId,
  })),
  createAnthropic: vi.fn(),
  createOpenAI: vi.fn(),
  createOpenRouter: vi.fn(),
  createXai: vi.fn(),
  openAiResponses: vi.fn((modelId: string) => ({
    provider: "openai",
    modelId,
  })),
  openRouterModel: vi.fn((modelId: string, _settings?: unknown) => ({
    provider: "openrouter",
    modelId,
  })),
  xaiResponses: vi.fn((modelId: string) => ({ provider: "xai", modelId })),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mocks.createAnthropic,
}));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: mocks.createOpenAI }));
vi.mock("@ai-sdk/xai", () => ({ createXai: mocks.createXai }));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.createOpenRouter,
}));
vi.mock("@/api/domains/ai", () => ({
  aiApi: { refreshSubscription: vi.fn() },
}));
vi.mock("@/utils/ai", () => ({
  readAiEnabled: vi.fn(() => true),
  readAiApiKey: vi.fn((provider: string) => `${provider}-key`),
  readSubscriptionCredentials: vi.fn((provider: string) =>
    provider === "chatgpt"
      ? {
          accessToken: "chatgpt-access",
          refreshToken: "chatgpt-refresh",
          expiresAt: Date.now() + 3_600_000,
          accountId: "account-1",
        }
      : {
          accessToken: "xai-access",
          refreshToken: "xai-refresh",
          expiresAt: Date.now() + 3_600_000,
        },
  ),
  saveSubscriptionCredentials: vi.fn(() => true),
}));

import { createAiModel, getAiProviderOptions } from "./model";

const selection = (provider: AiProviderId, modelId: string): ModelItem => ({
  id: `${provider}:${modelId}`,
  modelId,
  provider,
  providerName: provider,
  name: modelId,
  reasoningEfforts: ["low", "high"],
  defaultReasoningEffort: "high",
});

describe("createAiModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { origin: "https://app.example" } });
    mocks.createOpenRouter.mockReturnValue(mocks.openRouterModel);
    mocks.createOpenAI.mockReturnValue({ responses: mocks.openAiResponses });
    mocks.createAnthropic.mockReturnValue(mocks.anthropicModel);
    mocks.createXai.mockReturnValue({ responses: mocks.xaiResponses });
  });

  test("uses each official API-key provider", async () => {
    await createAiModel({
      selection: selection("openrouter", "openai/gpt-5.6-sol"),
      reasoningEffort: "high",
    });
    await createAiModel({
      selection: selection("openai", "gpt-5.6-sol"),
      reasoningEffort: "high",
    });
    await createAiModel({
      selection: selection("anthropic", "claude-opus-5"),
      reasoningEffort: "high",
    });

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({
      apiKey: "openrouter-key",
    });
    expect(mocks.openRouterModel).toHaveBeenCalledWith("openai/gpt-5.6-sol", {
      reasoning: { effort: "high" },
    });
    expect(mocks.createOpenAI).toHaveBeenCalledWith({ apiKey: "openai-key" });
    expect(mocks.createAnthropic).toHaveBeenCalledWith({
      apiKey: "anthropic-key",
      headers: { "anthropic-dangerous-direct-browser-access": "true" },
    });
  });

  test("uses the xAI SDK with the subscription access token", async () => {
    await createAiModel({
      selection: selection("xai", "grok-4.6"),
      reasoningEffort: "low",
    });

    expect(mocks.createXai).toHaveBeenCalledWith({ apiKey: "xai-access" });
    expect(mocks.xaiResponses).toHaveBeenCalledWith("grok-4.6");
  });

  test("adapts the OpenAI SDK fetch for ChatGPT subscription requests", async () => {
    await createAiModel({
      selection: selection("chatgpt", "gpt-5.6-sol"),
      reasoningEffort: "high",
      sessionId: "session-1",
    });

    const options = mocks.createOpenAI.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      name: "chatgpt",
      apiKey: "oauth",
      baseURL: "https://app.example/api/ai/chatgpt",
    });

    let forwardedInit: RequestInit | undefined;
    const fetchSpy = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      forwardedInit = init;
      return Promise.resolve(new Response());
    });
    vi.stubGlobal("fetch", fetchSpy);
    await options.fetch(
      new Request("https://app.example/api/ai/chatgpt/responses", {
        headers: { authorization: "Bearer oauth" },
      }),
    );
    const headers = new Headers(forwardedInit?.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-ai-provider-token")).toBe("chatgpt-access");
    expect(headers.get("x-ai-provider-account-id")).toBe("account-1");
    expect(headers.get("x-ai-session-id")).toBe("session-1");
    expect(forwardedInit?.credentials).toBe("include");
  });

  test("maps reasoning effort to each provider's SDK options", () => {
    expect(
      getAiProviderOptions(selection("openai", "gpt-5.6-sol"), "high"),
    ).toEqual({ openai: { reasoningEffort: "high" } });
    expect(
      getAiProviderOptions(selection("chatgpt", "gpt-5.6-sol"), "high"),
    ).toEqual({ openai: { reasoningEffort: "high" } });
    expect(
      getAiProviderOptions(selection("anthropic", "claude-opus-5"), "low"),
    ).toEqual({ anthropic: { effort: "low" } });
    expect(getAiProviderOptions(selection("xai", "grok-4.6"), "high")).toEqual({
      xai: { reasoningEffort: "high" },
    });
  });

  test("rejects a reasoning effort the selected model does not support", async () => {
    await expect(
      createAiModel({
        selection: selection("anthropic", "claude-opus-5"),
        reasoningEffort: "none",
      }),
    ).rejects.toThrow("does not support none reasoning effort");
  });
});
