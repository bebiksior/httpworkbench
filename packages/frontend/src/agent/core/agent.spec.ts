import { describe, expect, test, vi } from "vitest";
import type { CustomUIMessage } from "../types";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    createAgentUIStream: vi.fn(),
  };
});

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(),
}));

vi.mock("@/utils/openrouter", () => ({
  readOpenrouterKey: vi.fn(() => "test-openrouter-key"),
}));

vi.mock("@/agent/core/tools/updateResponseEditor", () => ({
  writeTool: {},
}));

vi.mock("@/agent/core/tools/createInstance", () => ({
  createInstanceTool: {},
}));

import { createAgentUIStream } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertAgentMessagesToModelMessages,
  createLocalAgentTransport,
} from "./agent";

describe("convertAgentMessagesToModelMessages", () => {
  test("drops incomplete tool calls from chat history", async () => {
    const messages: CustomUIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Build a landing page" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "text", text: "Updating the editor." },
          {
            type: "tool-write",
            toolCallId: "tool-1",
            state: "input-available",
            input: { html: "<h1>Hello</h1>" },
          },
        ],
      },
    ];

    await expect(
      convertAgentMessagesToModelMessages(messages),
    ).resolves.toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "Build a landing page" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Updating the editor." }],
      },
    ]);
  });
});

describe("createLocalAgentTransport", () => {
  test("passes editor content via agent instructions instead of appending a user message", async () => {
    vi.mocked(createOpenRouter).mockReturnValue(vi.fn(() => ({})) as never);

    const stream = new ReadableStream();
    vi.mocked(createAgentUIStream).mockResolvedValue(stream as never);

    const messages: CustomUIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Build a landing page" }],
      },
    ];

    const transport = createLocalAgentTransport({
      getModelId: () => "openai/gpt-4.1",
      getEditorContent: () => "<html><body>Hello</body></html>",
    });

    const result = await transport.sendMessages({
      messages,
      abortSignal: new AbortController().signal,
    } as never);

    expect(result).toBe(stream);
    expect(createAgentUIStream).toHaveBeenCalledTimes(1);

    const call = vi.mocked(createAgentUIStream).mock.calls[0]?.[0];
    expect(call?.uiMessages).toEqual(messages);
    expect(call?.originalMessages).toEqual(messages);
  });
});
