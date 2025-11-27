import { type ModelItem } from "./types/config";

export const availableModels: ModelItem[] = [
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
  { id: "openai/gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini" },
  { id: "openai/gpt-5-nano", name: "GPT-5 Nano" },
  { id: "openai/gpt-4.1", name: "GPT-4.1" },
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
  { id: "moonshotai/kimi-k2-thinking", name: "Kimi K2 Thinking" },
  { id: "x-ai/grok-code-fast-1", name: "Grok Code Fast 1" },
  { id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast" },
];
