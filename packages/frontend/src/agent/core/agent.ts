import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  createAgentUIStream,
  convertToModelMessages,
  type InferUITools,
  isToolUIPart,
  ToolLoopAgent,
  stepCountIs,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { readOpenrouterKey } from "@/utils/openrouter";
import { getErrorMessage } from "@/utils/error";
import { isAbsent } from "@/utils/types";
import type { CustomUIMessage, MessageMetadata } from "../types";
import { writeTool } from "@/agent/core/tools/updateResponseEditor";
import { createInstanceTool } from "@/agent/core/tools/createInstance";
import { SYSTEM_PROMPT } from "@/agent/core/prompt";

const agentTools = {
  write: writeTool,
  createInstance: createInstanceTool,
};

type AgentUIMessage = UIMessage<
  MessageMetadata,
  never,
  InferUITools<typeof agentTools>
>;

const buildAgentInstructions = (editorContent: string) => {
  return [
    SYSTEM_PROMPT.trim(),
    [
      "<editor_context>",
      "The current PoC response editor content is provided below as workspace state.",
      "Treat it as contextual state, not as a separate user message.",
      "<editor-content>",
      editorContent,
      "</editor-content>",
      "</editor_context>",
    ].join("\n"),
  ].join("\n\n");
};

const sanitizeAgentMessages = (messages: CustomUIMessage[]) => {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.filter((part) => {
      if (!isToolUIPart(part)) {
        return true;
      }

      return (
        part.state !== "input-streaming" && part.state !== "input-available"
      );
    }),
  }));
};

const createAgent = (modelId: string, getEditorContent: () => string) => {
  return new ToolLoopAgent({
    model: createModel(modelId),
    instructions: buildAgentInstructions(getEditorContent()),
    tools: agentTools,
    stopWhen: stepCountIs(10),
    prepareStep: ({ messages, ...settings }) => ({
      ...settings,
      messages,
      system: buildAgentInstructions(getEditorContent()),
    }),
  });
};

export const convertAgentMessagesToModelMessages = (
  messages: CustomUIMessage[],
) => {
  return convertToModelMessages(sanitizeAgentMessages(messages), {
    tools: agentTools,
  });
};

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

type TransportOptions = {
  getModelId: () => string;
  getEditorContent: () => string;
  onBeforeSend?: (messages: CustomUIMessage[]) => void;
};

class LocalAgentTransport implements ChatTransport<CustomUIMessage> {
  private readonly getModelId: () => string;
  private readonly getEditorContent: () => string;
  private readonly onBeforeSend?: (messages: CustomUIMessage[]) => void;

  constructor(options: TransportOptions) {
    this.getModelId = options.getModelId;
    this.getEditorContent = options.getEditorContent;
    this.onBeforeSend = options.onBeforeSend;
  }

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<CustomUIMessage>["sendMessages"]>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    this.onBeforeSend?.(messages);

    const modelId = this.getModelId();
    if (isAbsent(modelId) || modelId.trim() === "") {
      throw new Error("Select a model before sending messages.");
    }
    if (isAbsent(abortSignal)) {
      throw new Error("Abort signal is required.");
    }
    const result = await createAgentUIStream({
      agent: createAgent(modelId, this.getEditorContent),
      uiMessages: sanitizeAgentMessages(messages),
      originalMessages: messages as AgentUIMessage[],
      abortSignal,
      messageMetadata: ({ part }) => getMessageMetadata(part),
      onError: (error) => getErrorMessage(error),
    });
    return result;
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

export const createLocalAgentTransport = (options: TransportOptions) =>
  new LocalAgentTransport(options);
