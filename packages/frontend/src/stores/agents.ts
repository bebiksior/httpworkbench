import { Chat } from "@ai-sdk/vue";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { createLocalAgentTransport } from "@/agent/core/agent";
import type { CustomUIMessage } from "@/agent/types";
import { useConfigStore } from "./config";
import { useResponseEditorStore } from "./responseEditor";
import { getErrorMessage } from "@/utils/error";
import { isAbsent } from "@/utils/types";

export const useAgentsStore = defineStore("agents", () => {
  const configStore = useConfigStore();
  const responseEditorStore = useResponseEditorStore();

  const activeInstanceId = ref<string | undefined>(undefined);
  const error = ref<string | undefined>(undefined);
  const inputMessage = ref("");

  const chatMap = new Map<string, Chat<CustomUIMessage>>();
  const draftMap = new Map<string, string>();

  const createChatForInstance = (instanceId: string) => {
    const chat = new Chat<CustomUIMessage>({
      id: `poc-assistant-${instanceId}`,
      transport: createLocalAgentTransport({
        getModelId: () => configStore.agentsModel,
        getEditorContent: () => responseEditorStore.content,
      }),
      onError: (err: Error) => {
        if (activeInstanceId.value === instanceId) {
          error.value = err.message;
        }
      },
    });
    chatMap.set(instanceId, chat);
    return chat;
  };

  const setActiveInstance = (instanceId: string) => {
    const prevId = activeInstanceId.value;
    if (prevId !== undefined) {
      draftMap.set(prevId, inputMessage.value);
    }

    activeInstanceId.value = instanceId;
    inputMessage.value = draftMap.get(instanceId) ?? "";
    error.value = undefined;

    if (!chatMap.has(instanceId)) {
      createChatForInstance(instanceId);
    }
  };

  const clearActiveInstance = () => {
    const prevId = activeInstanceId.value;
    if (prevId !== undefined) {
      draftMap.set(prevId, inputMessage.value);
    }
    activeInstanceId.value = undefined;
    inputMessage.value = "";
    error.value = undefined;
  };

  watch(
    () => configStore.agentsModel,
    () => {
      const id = activeInstanceId.value;
      if (id !== undefined) {
        chatMap.get(id)?.stop();
      }
      error.value = undefined;
    },
  );

  const agent = computed(() => {
    const id = activeInstanceId.value;
    if (id === undefined) {
      return undefined;
    }
    const current = chatMap.get(id);
    if (isAbsent(current)) {
      return undefined;
    }
    return {
      status: current.status,
      messages: current.messages,
      error: error.value,
      clearError: () => {
        error.value = undefined;
      },
      sendMessage: async (payload: { text: string }) => {
        if (payload.text.trim() === "") {
          return;
        }
        error.value = undefined;
        try {
          await current.sendMessage(payload);
        } catch (err) {
          error.value = getErrorMessage(err);
        }
      },
    };
  });

  const abortAgent = () => {
    const id = activeInstanceId.value;
    if (id !== undefined) {
      chatMap.get(id)?.stop();
    }
  };

  const truncateMessages = (index: number) => {
    const id = activeInstanceId.value;
    if (id === undefined) {
      return;
    }
    const current = chatMap.get(id);
    if (isAbsent(current)) {
      return;
    }
    current.messages = current.messages.slice(0, index);
  };

  return {
    inputMessage,
    agent,
    abortAgent,
    truncateMessages,
    setActiveInstance,
    clearActiveInstance,
  };
});
