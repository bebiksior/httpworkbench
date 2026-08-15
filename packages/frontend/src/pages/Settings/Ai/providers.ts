import type { Component } from "vue";
import type { AiSubscriptionProviderId } from "@/api/domains/ai";
import {
  AnthropicIcon,
  OpenAIIcon,
  OpenRouterIcon,
  XAIIcon,
} from "@/components/BrandIcons";
import type { AiApiKeyProviderId, AiProviderId } from "@/utils/ai";

type AiProviderBase<Id extends AiProviderId> = {
  id: Id;
  name: string;
  icon: Component;
};

export type AiApiKeyProvider = AiProviderBase<AiApiKeyProviderId> & {
  placeholder: string;
  keyUrl: string;
};

export type AiSubscriptionProvider =
  AiProviderBase<AiSubscriptionProviderId> & {
    description: string;
  };

export const API_KEY_PROVIDERS: AiApiKeyProvider[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: OpenRouterIcon,
    placeholder: "sk-or-...",
    keyUrl: "https://openrouter.ai/settings/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: OpenAIIcon,
    placeholder: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    icon: AnthropicIcon,
    placeholder: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
];

export const SUBSCRIPTION_PROVIDERS: AiSubscriptionProvider[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    icon: OpenAIIcon,
    description: "Models included with your ChatGPT plan.",
  },
  {
    id: "xai",
    name: "xAI",
    icon: XAIIcon,
    description: "Grok models included with your X or SuperGrok plan.",
  },
];
