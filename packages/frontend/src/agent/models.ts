import { type ModelItem } from "./types/config";

export const availableModels: ModelItem[] = [
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  { id: "openai/gpt-5.4", name: "GPT-5.4" },
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro" },
  { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash" },
  { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5" },
  { id: "inception/mercury-2", name: "Mercury 2" },
  { id: "x-ai/grok-code-fast-1", name: "Grok Code Fast 1" },
  { id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast" },
];
