import { type ModelItem } from "./types/config";

export const availableModels: ModelItem[] = [
  { id: "anthropic/claude-opus-5", name: "Claude Opus 5" },
  { id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol" },
  { id: "openai/gpt-5.6-terra", name: "GPT-5.6 Terra" },
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna" },
  { id: "google/gemini-3.7-flash", name: "Gemini 3.7 Flash" },
  { id: "x-ai/grok-4.6", name: "Grok 4.6" },
  { id: "z-ai/glm-5.2", name: "GLM 5.2" },
];
