import { describe, expect, test } from "vitest";
import { getToolMessagePresentation } from "./toolMessage.utils";

describe("getToolMessagePresentation", () => {
  test("returns aborted copy for interrupted input states", () => {
    expect(
      getToolMessagePresentation({
        toolName: "write",
        state: "input-streaming",
        output: undefined,
        messageState: "abort",
        isAgentStreaming: true,
      }),
    ).toEqual({
      isProcessing: false,
      label: "Stopped updating the code",
    });
  });

  test("returns natural copy for streaming input", () => {
    expect(
      getToolMessagePresentation({
        toolName: "write",
        state: "input-streaming",
        output: undefined,
        messageState: "streaming",
        isAgentStreaming: true,
      }),
    ).toEqual({
      isProcessing: true,
      label: "Updating the code...",
    });
  });

  test("returns natural copy for available input", () => {
    expect(
      getToolMessagePresentation({
        toolName: "write",
        state: "input-available",
        output: undefined,
        messageState: "streaming",
        isAgentStreaming: true,
      }),
    ).toEqual({
      isProcessing: true,
      label: "Updating the code...",
    });
  });

  test("returns success state for completed tool output", () => {
    expect(
      getToolMessagePresentation({
        toolName: "createInstance",
        state: "output-available",
        output: { status: "created" },
        messageState: "done",
        isAgentStreaming: false,
      }),
    ).toEqual({
      isProcessing: false,
      label: "Created a new endpoint",
    });
  });

  test("returns failure state for errored tool output", () => {
    expect(
      getToolMessagePresentation({
        toolName: "write",
        state: "output-error",
        output: undefined,
        messageState: "error",
        isAgentStreaming: false,
      }),
    ).toEqual({
      isProcessing: false,
      label: "Couldn't update the code",
    });
  });

  test("uses tool output to detect business-level failures", () => {
    expect(
      getToolMessagePresentation({
        toolName: "createInstance",
        state: "output-available",
        output: { status: "error", error: "boom" },
        messageState: "done",
        isAgentStreaming: false,
      }),
    ).toEqual({
      isProcessing: false,
      label: "Couldn't create a new endpoint",
    });
  });

  test("does not report processing when the agent is not streaming", () => {
    expect(
      getToolMessagePresentation({
        toolName: "write",
        state: "input-available",
        output: undefined,
        messageState: "streaming",
        isAgentStreaming: false,
      }).isProcessing,
    ).toBe(false);
  });
});
