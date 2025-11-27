import { computed, ref, type Ref } from "vue";
import type { MessageState } from "@/agent/types";
import { useAgentsStore } from "@/stores";

type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export const useToolMessage = (params: {
  toolName: Ref<string>;
  state: Ref<ToolState>;
  output: Ref<unknown>;
  messageState: Ref<MessageState | undefined>;
}) => {
  const { toolName, state, output, messageState } = params;
  const agentsStore = useAgentsStore();
  const showDetails = ref(false);

  const isProcessing = computed(() => {
    const isActiveState =
      state.value === "input-streaming" || state.value === "input-available";
    if (messageState.value === "abort") return false;
    return isActiveState && agentsStore.agent?.status === "streaming";
  });

  const toolIcon = computed(() => {
    if (
      messageState.value === "abort" &&
      (state.value === "input-streaming" || state.value === "input-available")
    ) {
      return "pi pi-exclamation-triangle";
    }

    switch (state.value) {
      case "input-streaming":
        return "pi pi-spinner pi-spin";
      case "input-available":
        return "pi pi-spinner pi-spin";
      case "output-available":
        return "pi pi-check";
      case "output-error":
        return "pi pi-exclamation-triangle";
      default:
        return "pi pi-cog";
    }
  });

  const formatToolCall = computed(() => {
    if (
      messageState.value === "abort" &&
      (state.value === "input-streaming" || state.value === "input-available")
    ) {
      return `Aborted ${toolName.value}`;
    }

    if (state.value === "input-streaming") {
      return `Preparing ${toolName.value}...`;
    }

    if (state.value === "input-available") {
      return `Processing ${toolName.value}...`;
    }

    if (state.value === "output-error") {
      return `Failed ${toolName.value}`;
    }

    return `Called tool ${toolName.value}`;
  });

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
