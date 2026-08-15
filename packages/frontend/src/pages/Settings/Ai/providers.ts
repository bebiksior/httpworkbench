import type { AiSubscriptionProviderId } from "@/api/domains/ai";
import type { AiApiKeyProviderId, AiProviderId } from "@/utils/ai";

type AiProviderBase<Id extends AiProviderId> = {
  id: Id;
  name: string;
  description: string;
  icon: string;
  accentClass: string;
  linkUrl: string;
  linkLabel: string;
};

export type AiApiKeyProvider = AiProviderBase<AiApiKeyProviderId> & {
  placeholder: string;
};

export type AiSubscriptionProvider = AiProviderBase<AiSubscriptionProviderId>;

export const API_KEY_PROVIDERS: AiApiKeyProvider[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "One key for models from many vendors.",
    icon: "pi pi-sparkles",
    accentClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    linkUrl: "https://openrouter.ai/settings/keys",
    linkLabel: "Get an OpenRouter key",
    placeholder: "sk-or-...",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models billed to your OpenAI account.",
    icon: "pi pi-microchip-ai",
    accentClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    linkUrl: "https://platform.openai.com/api-keys",
    linkLabel: "Get an OpenAI key",
    placeholder: "sk-...",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models billed to your Anthropic account.",
    icon: "pi pi-sun",
    accentClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    linkUrl: "https://console.anthropic.com/settings/keys",
    linkLabel: "Get an Anthropic key",
    placeholder: "sk-ant-...",
  },
];

export const SUBSCRIPTION_PROVIDERS: AiSubscriptionProvider[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    description: "Use the models included with your ChatGPT plan.",
    icon: "pi pi-comments",
    accentClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    linkUrl: "https://chatgpt.com",
    linkLabel: "About ChatGPT plans",
  },
  {
    id: "xai",
    name: "xAI",
    description: "Use the Grok models included with your X or SuperGrok plan.",
    icon: "pi pi-star",
    accentClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    linkUrl: "https://grok.com",
    linkLabel: "About Grok plans",
  },
];
