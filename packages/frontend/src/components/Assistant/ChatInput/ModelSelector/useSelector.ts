import { type Component, computed, watch } from "vue";
import {
  AnthropicIcon,
  GoogleIcon,
  OpenAIIcon,
  OpenRouterIcon,
  UnknownIcon,
  XAIIcon,
} from "@/components/BrandIcons";
import { availableModels } from "@/agent/models";
import type { ModelItem, ReasoningEffort } from "@/agent/types/config";
import { useAssistantModelStore } from "@/stores";
import { useAiSettings } from "@/utils/ai";

type AugmentedModelItem = ModelItem & { icon: Component };

const getIcon = (model: ModelItem) => {
  const id = model.modelId.toLowerCase();

  if (model.provider === "anthropic") return AnthropicIcon;
  if (model.provider === "openai" || model.provider === "chatgpt") {
    return OpenAIIcon;
  }
  if (model.provider === "xai") return XAIIcon;
  if (id.startsWith("anthropic/")) return AnthropicIcon;
  if (id.startsWith("openai/")) return OpenAIIcon;
  if (id.startsWith("google/")) return GoogleIcon;
  if (id.startsWith("x-ai/")) return XAIIcon;

  if (id.includes("gpt") || id.includes("openai")) return OpenAIIcon;
  if (id.includes("claude") || id.includes("anthropic")) return AnthropicIcon;
  if (id.includes("gemini") || id.includes("google")) return GoogleIcon;
  if (model.provider === "openrouter") return OpenRouterIcon;

  return UnknownIcon;
};

export const useSelector = () => {
  const assistantModelStore = useAssistantModelStore();
  const { isProviderConfigured } = useAiSettings();

  const modelId = computed<string>({
    get() {
      return assistantModelStore.agentsModel;
    },
    set(value: string) {
      assistantModelStore.agentsModel = value;
    },
  });

  const reasoningEffort = computed<ReasoningEffort>({
    get() {
      return assistantModelStore.agentsReasoningEffort;
    },
    set(value) {
      assistantModelStore.agentsReasoningEffort = value;
    },
  });

  const models = computed<AugmentedModelItem[]>(() =>
    availableModels
      .filter((item) => isProviderConfigured(item.provider))
      .map((item) => ({
        ...item,
        icon: getIcon(item),
      })),
  );

  const selectedModel = computed<AugmentedModelItem | undefined>(() => {
    const item = models.value.find((i) => i.id === modelId.value);
    if (!item) return undefined;
    return item;
  });

  watch(
    models,
    (configuredModels) => {
      if (!configuredModels.some((model) => model.id === modelId.value)) {
        modelId.value = configuredModels[0]?.id ?? "";
      }
    },
    { immediate: true },
  );

  watch(
    selectedModel,
    (model) => {
      if (
        model !== undefined &&
        !model.reasoningEfforts.includes(reasoningEffort.value)
      ) {
        reasoningEffort.value = model.defaultReasoningEffort;
      }
    },
    { immediate: true },
  );

  return {
    modelId,
    models,
    reasoningEffort,
    selectedModel,
  };
};
