import {
  createAnthropic,
  type AnthropicLanguageModelOptions,
} from "@ai-sdk/anthropic";
import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
} from "@ai-sdk/openai";
import { createXai, type XaiLanguageModelResponsesOptions } from "@ai-sdk/xai";
import {
  createOpenRouter,
  type OpenRouterChatSettings,
} from "@openrouter/ai-sdk-provider";
import type { JSONValue, LanguageModel } from "ai";
import { aiApi, type SubscriptionCredentials } from "@/api/domains/ai";
import { apiPaths } from "@/api/paths";
import {
  REASONING_EFFORT_SCHEMAS,
  type ModelItem,
  type ReasoningEffort,
} from "@/agent/types/config";
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

const assertReasoningEffortSupported = (
  selection: ModelItem,
  reasoningEffort: ReasoningEffort,
) => {
  if (!selection.reasoningEfforts.includes(reasoningEffort)) {
    throw new Error(
      `${selection.name} does not support ${reasoningEffort} reasoning effort.`,
    );
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

export const getAiProviderOptions = (
  selection: ModelItem,
  reasoningEffort: ReasoningEffort,
): Record<string, Record<string, JSONValue>> | undefined => {
  assertReasoningEffortSupported(selection, reasoningEffort);

  switch (selection.provider) {
    case "openrouter":
      return undefined;
    case "openai":
    case "chatgpt":
      return {
        openai: {
          reasoningEffort,
        } satisfies OpenAILanguageModelResponsesOptions,
      };
    case "anthropic":
      return {
        anthropic: {
          effort: REASONING_EFFORT_SCHEMAS.anthropic.parse(reasoningEffort),
        } satisfies AnthropicLanguageModelOptions,
      };
    case "xai":
      return {
        xai: {
          reasoningEffort: REASONING_EFFORT_SCHEMAS.xai.parse(reasoningEffort),
        } satisfies XaiLanguageModelResponsesOptions,
      };
  }
};

export const createAiModel = async ({
  selection,
  reasoningEffort,
  sessionId,
}: {
  selection: ModelItem;
  reasoningEffort: ReasoningEffort;
  sessionId?: string;
}): Promise<LanguageModel> => {
  ensureAiEnabled();
  assertReasoningEffortSupported(selection, reasoningEffort);

  switch (selection.provider) {
    case "openrouter": {
      const provider = createOpenRouter({
        apiKey: requireApiKey("openrouter"),
      });
      return provider(selection.modelId, {
        reasoning: {
          effort: REASONING_EFFORT_SCHEMAS.openrouter.parse(reasoningEffort),
        },
      } satisfies OpenRouterChatSettings);
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
