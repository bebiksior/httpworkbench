import { describe, expect, test } from "vitest";
import { getToolMessagePresentation } from "./toolMessage.utils";

describe("getToolMessagePresentation", () => {
  test("marks aborted input states with a warning icon", () => {
    expect(
      getToolMessagePresentation({
        toolName: "createInstance",
        state: "input-streaming",
        messageState: "abort",
        isAgentStreaming: true,
      }),
    ).toEqual({
      isProcessing: false,
      icon: "pi pi-exclamation-triangle",
      label: "Aborted createInstance",
    });
  });

  test("returns the preparing state for streaming input", () => {
    expect(
      getToolMessagePresentation({
        toolName: "createInstance",
        state: "input-streaming",
        messageState: "streaming",
        isAgentStreaming: true,
      }),
    ).toEqual({
      isProcessing: true,
      icon: "pi pi-spinner pi-spin",
      label: "Preparing createInstance...",
    });
  });

  test("returns the processing state for available input", () => {
    expect(
      getToolMessagePresentation({
        toolName: "createInstance",
        state: "input-available",
        messageState: "streaming",
        isAgentStreaming: true,
      }),
    ).toEqual({
      isProcessing: true,
      icon: "pi pi-spinner pi-spin",
      label: "Processing createInstance...",
    });
  });

  test("returns success state for completed tool output", () => {
    expect(
      getToolMessagePresentation({
        toolName: "createInstance",
        state: "output-available",
        messageState: "done",
        isAgentStreaming: false,
      }),
    ).toEqual({
      isProcessing: false,
      icon: "pi pi-check",
      label: "Called tool createInstance",
    });
  });

  test("returns failure state for errored tool output", () => {
    expect(
      getToolMessagePresentation({
        toolName: "createInstance",
        state: "output-error",
        messageState: "error",
        isAgentStreaming: false,
      }),
    ).toEqual({
      isProcessing: false,
      icon: "pi pi-exclamation-triangle",
      label: "Failed createInstance",
    });
  });

  test("does not report processing when the agent is not streaming", () => {
    expect(
      getToolMessagePresentation({
        toolName: "createInstance",
        state: "input-available",
        messageState: "streaming",
        isAgentStreaming: false,
      }).isProcessing,
    ).toBe(false);
  });
});
