import { z } from "zod";
import type { AiProviderId } from "@/utils/ai";

const openAiReasoningEffortSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export const REASONING_EFFORT_SCHEMAS = {
  openrouter: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]),
  openai: openAiReasoningEffortSchema,
  anthropic: z.enum(["low", "medium", "high", "xhigh", "max"]),
  chatgpt: openAiReasoningEffortSchema,
  xai: z.enum(["none", "low", "medium", "high", "xhigh"]),
} satisfies Record<AiProviderId, z.ZodType>;

type ReasoningEffortSchema = (typeof REASONING_EFFORT_SCHEMAS)[AiProviderId];

export type ReasoningEffort = z.infer<ReasoningEffortSchema>;

export const REASONING_EFFORT_LABELS = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
} satisfies Record<ReasoningEffort, string>;

export type ModelItem = {
  id: string;
  modelId: string;
  provider: AiProviderId;
  providerName: string;
  name: string;
  reasoningEfforts: readonly ReasoningEffort[];
  defaultReasoningEffort: ReasoningEffort;
};
