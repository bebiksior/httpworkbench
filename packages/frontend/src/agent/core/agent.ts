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
  type LanguageModel,
} from "ai";
import { getErrorMessage } from "@/utils/error";
import { isAbsent } from "@/utils/types";
import type { CustomUIMessage, MessageMetadata } from "../types";
import { writeTool } from "@/agent/core/tools/updateResponseEditor";
import { createInstanceTool } from "@/agent/core/tools/createInstance";
import { SYSTEM_PROMPT } from "@/agent/core/prompt";
import { createAiModel } from "@/agent/core/model";
import { findModel } from "@/agent/models";

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

const createAgent = (
  model: LanguageModel,
  initialEditorContent: string,
  getEditorContent: () => string,
) => {
  return new ToolLoopAgent({
    model,
    instructions: buildAgentInstructions(initialEditorContent),
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
  sessionId?: string;
  getModelId: () => string;
  getEditorContent: () => string;
  onBeforeSend?: (messages: CustomUIMessage[]) => void;
};

class LocalAgentTransport implements ChatTransport<CustomUIMessage> {
  private readonly getModelId: () => string;
  private readonly sessionId?: string;
  private readonly getEditorContent: () => string;
  private readonly onBeforeSend?: (messages: CustomUIMessage[]) => void;

  constructor(options: TransportOptions) {
    this.getModelId = options.getModelId;
    this.sessionId = options.sessionId;
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
    const selection = findModel(modelId);
    if (selection === undefined) {
      throw new Error("The selected model is no longer available.");
    }
    if (isAbsent(abortSignal)) {
      throw new Error("Abort signal is required.");
    }

    const editorContentAtSendTime = this.getEditorContent();
    const model = await createAiModel(selection, this.sessionId);

    const result = await createAgentUIStream({
      agent: createAgent(model, editorContentAtSendTime, this.getEditorContent),
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
