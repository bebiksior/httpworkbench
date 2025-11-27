import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ChatTransport,
  type UIMessageChunk,
} from "ai";
import { readOpenrouterKey } from "@/utils/openrouter";
import { getErrorMessage } from "@/utils/error";
import { isAbsent } from "@/utils/types";
import type { CustomUIMessage, MessageMetadata } from "../types";
import { updateResponseEditorTool } from "@/agent/core/tools/updateResponseEditor";
import { createInstanceTool } from "@/agent/core/tools/createInstance";
import { SYSTEM_PROMPT } from "@/agent/core/prompt";

const ensureOpenrouterKey = () => {
  const key = readOpenrouterKey();
  if (isAbsent(key) || key.trim() === "") {
    throw new Error(
      "OpenRouter API key is missing. Add it in Settings before using the assistant.",
    );
  }
  return key;
};

const createModel = (modelId: string) => {
  const openrouter = createOpenRouter({
    apiKey: ensureOpenrouterKey(),
    extraBody: {
      reasoning: {
        effort: "high",
        enabled: true,
      },
    },
  });
  return openrouter(modelId);
};

const getMessageMetadata = (part: {
  type: string;
}): MessageMetadata | undefined => {
  if (part.type === "start") {
    return { state: "streaming", createdAt: Date.now() };
  }
  if (part.type === "finish") {
    return { state: "done", finishedAt: Date.now() };
  }
  if (part.type === "error") {
    return { state: "error", finishedAt: Date.now() };
  }
  if (part.type === "abort") {
    return { state: "abort", finishedAt: Date.now() };
  }
  return undefined;
};

class LocalAgentTransport implements ChatTransport<CustomUIMessage> {
  private readonly getModelId: () => string;
  private readonly getEditorContent: () => string;

  constructor(getModelId: () => string, getEditorContent: () => string) {
    this.getModelId = getModelId;
    this.getEditorContent = getEditorContent;
  }

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<CustomUIMessage>["sendMessages"]>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const modelId = this.getModelId();
    if (isAbsent(modelId) || modelId.trim() === "") {
      throw new Error("Select a model before sending messages.");
    }
    if (isAbsent(abortSignal)) {
      throw new Error("Abort signal is required.");
    }
    const editorContent = this.getEditorContent();

    const apiMessages = [...messages];
    apiMessages.push({
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        {
          type: "text",
          text:
            "This message gets attached automatically. Here's the current editor content: <editor-content>" +
            editorContent +
            "</editor-content>",
        },
      ],
    });

    const result = streamText({
      model: createModel(modelId),
      system: SYSTEM_PROMPT,
      messages: convertToModelMessages(apiMessages),
      tools: {
        updateResponseEditor: updateResponseEditorTool,
        createInstance: createInstanceTool,
      },
      stopWhen: stepCountIs(10),
      abortSignal,
    });
    return result.toUIMessageStream<CustomUIMessage>({
      originalMessages: messages,
      messageMetadata: ({ part }) => getMessageMetadata(part),
      onError: (error) => getErrorMessage(error),
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

export const createLocalAgentTransport = (options: {
  getModelId: () => string;
  getEditorContent: () => string;
}) => new LocalAgentTransport(options.getModelId, options.getEditorContent);
