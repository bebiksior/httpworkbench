import type { ModelItem } from "./types/config";
import type { AiProviderId } from "@/utils/ai";

const OPENROUTER_MODELS = [
  { modelId: "anthropic/claude-opus-5", name: "Claude Opus 5" },
  { modelId: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol" },
  { modelId: "openai/gpt-5.6-terra", name: "GPT-5.6 Terra" },
  { modelId: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna" },
  { modelId: "google/gemini-3.7-flash", name: "Gemini 3.7 Flash" },
  { modelId: "x-ai/grok-4.6", name: "Grok 4.6" },
  { modelId: "z-ai/glm-5.2", name: "GLM 5.2" },
] as const;

const providerModels = (
  provider: AiProviderId,
  providerName: string,
  models: ReadonlyArray<{ modelId: string; name: string }>,
): ModelItem[] =>
  models.map(({ modelId, name }) => ({
    id: `${provider}:${modelId}`,
    modelId,
    provider,
    providerName,
    name,
  }));

const OPENAI_MODELS = OPENROUTER_MODELS.filter(({ modelId }) =>
  modelId.startsWith("openai/"),
).map(({ modelId, name }) => ({
  modelId: modelId.slice("openai/".length),
  name,
}));

export const availableModels: ModelItem[] = [
  ...providerModels("openrouter", "OpenRouter", OPENROUTER_MODELS),
  ...providerModels("openai", "OpenAI API", OPENAI_MODELS),
  ...providerModels("anthropic", "Anthropic API", [
    { modelId: "claude-opus-5", name: "Claude Opus 5" },
  ]),
  ...providerModels("chatgpt", "ChatGPT", OPENAI_MODELS),
  ...providerModels("xai", "xAI subscription", [
    { modelId: "grok-4.6", name: "Grok 4.6" },
  ]),
];

export const findModel = (id: string) =>
  availableModels.find((model) => model.id === id);
