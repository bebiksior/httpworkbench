import { type Component, computed } from "vue";
import { AnthropicIcon, GoogleIcon, OpenAIIcon, XAIIcon } from "./icons";
import UnknownIcon from "./icons/Unknown.vue";
import { availableModels } from "@/agent/models";
import { type ModelItem } from "@/agent/types/config";
import { useConfigStore } from "@/stores";

type AugmentedModelItem = ModelItem & { icon: Component };

const getIcon = (model: ModelItem) => {
  const id = model.id.toLowerCase();

  if (id.startsWith("anthropic/")) return AnthropicIcon;
  if (id.startsWith("openai/")) return OpenAIIcon;
  if (id.startsWith("google/")) return GoogleIcon;
  if (id.startsWith("x-ai/")) return XAIIcon;

  if (id.includes("gpt") || id.includes("openai")) return OpenAIIcon;
  if (id.includes("claude") || id.includes("anthropic")) return AnthropicIcon;
  if (id.includes("gemini") || id.includes("google")) return GoogleIcon;

  return UnknownIcon;
};

export const useSelector = () => {
  const configStore = useConfigStore();

  const modelId = computed<string>({
    get() {
      return configStore.agentsModel;
    },
    set(value: string) {
      configStore.agentsModel = value;
    },
  });

  const models = computed<AugmentedModelItem[]>(() =>
    availableModels.map((item) => ({
      ...item,
      icon: getIcon(item),
    })),
  );

  const selectedModel = computed<AugmentedModelItem | undefined>(() => {
    const item = availableModels.find((i) => i.id === modelId.value);
    if (!item) return undefined;
    return { ...item, icon: getIcon(item) };
  });

  return {
    modelId,
    models,
    selectedModel,
  };
};
