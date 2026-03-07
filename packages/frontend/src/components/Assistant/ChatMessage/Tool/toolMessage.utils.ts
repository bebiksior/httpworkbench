import type { MessageState } from "@/agent/types";

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export const getToolMessagePresentation = (params: {
  toolName: string;
  state: ToolState;
  messageState: MessageState | undefined;
  isAgentStreaming: boolean;
}): {
  isProcessing: boolean;
  icon: string;
  label: string;
} => {
  const { toolName, state, messageState, isAgentStreaming } = params;
  const isInputState =
    state === "input-streaming" || state === "input-available";
  const isAbortedInput = messageState === "abort" && isInputState;

  if (isAbortedInput) {
    return {
      isProcessing: false,
      icon: "pi pi-exclamation-triangle",
      label: `Aborted ${toolName}`,
    };
  }

  switch (state) {
    case "input-streaming":
      return {
        isProcessing: isAgentStreaming,
        icon: "pi pi-spinner pi-spin",
        label: `Preparing ${toolName}...`,
      };
    case "input-available":
      return {
        isProcessing: isAgentStreaming,
        icon: "pi pi-spinner pi-spin",
        label: `Processing ${toolName}...`,
      };
    case "output-error":
      return {
        isProcessing: false,
        icon: "pi pi-exclamation-triangle",
        label: `Failed ${toolName}`,
      };
    case "output-available":
      return {
        isProcessing: false,
        icon: "pi pi-check",
        label: `Called tool ${toolName}`,
      };
  }
};
