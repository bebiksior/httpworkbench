import { computed, type Ref } from "vue";
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

  const presentation = computed(() => {
    return getToolMessagePresentation({
      toolName: toolName.value,
      state: state.value,
      output: output.value,
      messageState: messageState.value,
      isAgentStreaming: agentsStore.agent?.status === "streaming",
    });
  });

  const isProcessing = computed(() => presentation.value.isProcessing);
  const formatToolCall = computed(() => presentation.value.label);

  return {
    isProcessing,
    formatToolCall,
  };
};
