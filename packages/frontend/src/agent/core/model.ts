import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { aiApi, type SubscriptionCredentials } from "@/api/domains/ai";
import { apiPaths } from "@/api/paths";
import type { ModelItem } from "@/agent/types/config";
import {
  readAiApiKey,
  readAiEnabled,
  readSubscriptionCredentials,
  saveSubscriptionCredentials,
  type AiApiKeyProviderId,
} from "@/utils/ai";

const SUBSCRIPTION_REFRESH_SKEW_MS = 2 * 60 * 1000;
const refreshPromises = new Map<
  "chatgpt" | "xai",
  Promise<SubscriptionCredentials>
>();

const requireApiKey = (provider: AiApiKeyProviderId) => {
  const key = readAiApiKey(provider)?.trim();
  if (key === undefined || key === "") {
    throw new Error(`${provider} API key is missing. Add it in AI settings.`);
  }
  return key;
};

const ensureAiEnabled = () => {
  if (!readAiEnabled()) {
    throw new Error("AI features are disabled. Enable them in AI settings.");
  }
};

const getSubscriptionCredentials = async (provider: "chatgpt" | "xai") => {
  const stored = readSubscriptionCredentials(provider);
  if (stored === undefined) {
    throw new Error(`${provider} is not connected. Connect it in AI settings.`);
  }
  if (stored.expiresAt > Date.now() + SUBSCRIPTION_REFRESH_SKEW_MS) {
    return stored;
  }

  let refresh = refreshPromises.get(provider);
  if (refresh === undefined) {
    refresh = aiApi
      .refreshSubscription(provider, stored.refreshToken)
      .then((credentials) => {
        const current = readSubscriptionCredentials(provider);
        if (current?.refreshToken !== stored.refreshToken) {
          throw new Error(`${provider} connection changed during refresh`);
        }
        const updated = { ...stored, ...credentials };
        if (!saveSubscriptionCredentials(provider, updated)) {
          throw new Error("Browser storage is unavailable");
        }
        return updated;
      })
      .finally(() => refreshPromises.delete(provider));
    refreshPromises.set(provider, refresh);
  }
  return await refresh;
};

const chatGptFetch = (
  accessToken: string,
  accountId: string,
  sessionId?: string,
): typeof globalThis.fetch => {
  return async (input, init) => {
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.delete("authorization");
    headers.set("x-ai-provider-token", accessToken);
    headers.set("x-ai-provider-account-id", accountId);
    if (sessionId !== undefined) {
      headers.set("x-ai-session-id", sessionId);
    }
    return fetch(input, { ...init, headers, credentials: "include" });
  };
};

export const createAiModel = async (
  selection: ModelItem,
  sessionId?: string,
): Promise<LanguageModel> => {
  ensureAiEnabled();

  switch (selection.provider) {
    case "openrouter": {
      const provider = createOpenRouter({
        apiKey: requireApiKey("openrouter"),
        extraBody: { reasoning: { effort: "max", enabled: true } },
      });
      return provider(selection.modelId);
    }
    case "openai":
      return createOpenAI({ apiKey: requireApiKey("openai") }).responses(
        selection.modelId,
      );
    case "anthropic":
      return createAnthropic({
        apiKey: requireApiKey("anthropic"),
        headers: { "anthropic-dangerous-direct-browser-access": "true" },
      })(selection.modelId);
    case "xai": {
      const credentials = await getSubscriptionCredentials("xai");
      ensureAiEnabled();
      return createXai({ apiKey: credentials.accessToken }).responses(
        selection.modelId,
      );
    }
    case "chatgpt": {
      const credentials = await getSubscriptionCredentials("chatgpt");
      ensureAiEnabled();
      if (credentials.accountId === undefined) {
        throw new Error(
          "ChatGPT account information is missing. Reconnect it in AI settings.",
        );
      }
      const provider = createOpenAI({
        name: "chatgpt",
        apiKey: "oauth",
        baseURL: `${window.location.origin}${apiPaths.aiChatGpt}`,
        fetch: chatGptFetch(
          credentials.accessToken,
          credentials.accountId,
          sessionId,
        ),
      });
      return provider.responses(selection.modelId);
    }
  }
};
