import type { MessageState } from "@/agent/types";

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

export const getToolMessagePresentation = (params: {
  toolName: string;
  state: ToolState;
  output: unknown;
  messageState: MessageState | undefined;
  isAgentStreaming: boolean;
}): {
  isProcessing: boolean;
  label: string;
} => {
  const { toolName, state, output, messageState, isAgentStreaming } = params;
  const isInputState =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "approval-requested" ||
    state === "approval-responded";
  const isAbortedInput = messageState === "abort" && isInputState;
  const copy = getToolCopy(toolName);

  if (isAbortedInput) {
    return {
      isProcessing: false,
      label: copy.aborted,
    };
  }

  switch (state) {
    case "input-streaming":
    case "input-available":
    case "approval-responded":
      return {
        isProcessing: isAgentStreaming,
        label: copy.active,
      };
    case "approval-requested":
      return {
        isProcessing: false,
        label: copy.approval,
      };
    case "output-error":
      return {
        isProcessing: false,
        label: copy.error,
      };
    case "output-denied":
      return {
        isProcessing: false,
        label: copy.denied,
      };
    case "output-available":
      return {
        isProcessing: false,
        label: hasToolError(output) ? copy.error : copy.success,
      };
  }
};

const getToolCopy = (
  toolName: string,
): {
  active: string;
  success: string;
  error: string;
  approval: string;
  denied: string;
  aborted: string;
} => {
  switch (toolName) {
    case "write":
      return {
        active: "Updating the code...",
        success: "Updated the code",
        error: "Couldn't update the code",
        approval: "Waiting for approval to update the code",
        denied: "Didn't get approval to update the code",
        aborted: "Stopped updating the code",
      };
    case "createInstance":
      return {
        active: "Creating a new endpoint...",
        success: "Created a new endpoint",
        error: "Couldn't create a new endpoint",
        approval: "Waiting for approval to create a new endpoint",
        denied: "Didn't get approval to create a new endpoint",
        aborted: "Stopped creating a new endpoint",
      };
    default:
      return {
        active: "Using a tool...",
        success: "Used a tool",
        error: "A tool couldn't finish",
        approval: "Waiting for approval to use a tool",
        denied: "Didn't get approval to use a tool",
        aborted: "Stopped using a tool",
      };
  }
};

const hasToolError = (output: unknown) => {
  if (output == null || typeof output !== "object") {
    return false;
  }

  const status = "status" in output ? output.status : undefined;
  return status === "error" || status === "failed";
};
