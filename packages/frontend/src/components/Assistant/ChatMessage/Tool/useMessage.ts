import { computed, ref, type Ref } from "vue";
import type { MessageState } from "@/agent/types";
import { useAgentsStore } from "@/stores";
import {
  getToolMessagePresentation,
  type ToolState,
} from "./toolMessage.utils";

export const useToolMessage = (params: {
  toolName: Ref<string>;
  state: Ref<ToolState>;
  output: Ref<unknown>;
  messageState: Ref<MessageState | undefined>;
}) => {
  const { toolName, state, output, messageState } = params;
  const agentsStore = useAgentsStore();
  const showDetails = ref(false);

  const presentation = computed(() => {
    return getToolMessagePresentation({
      toolName: toolName.value,
      state: state.value,
      messageState: messageState.value,
      isAgentStreaming: agentsStore.agent?.status === "streaming",
    });
  });

  const isProcessing = computed(() => presentation.value.isProcessing);
  const toolIcon = computed(() => presentation.value.icon);
  const formatToolCall = computed(() => presentation.value.label);

  const toolDetails = computed(() => {
    if (output.value === undefined) return undefined;
    return JSON.stringify(output.value, null, 2);
  });

  const toggleDetails = () => {
    if (toolDetails.value !== undefined) {
      showDetails.value = !showDetails.value;
    }
  };

  return {
    isProcessing,
    toolIcon,
    formatToolCall,
    toolDetails,
    showDetails,
    toggleDetails,
  };
};
