import { Chat } from "@ai-sdk/vue";
import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import { createLocalAgentTransport } from "@/agent/core/agent";
import type { CustomUIMessage } from "@/agent/types";
import { useConfigStore } from "./config";
import { useResponseEditorStore } from "./responseEditor";
import { getErrorMessage } from "@/utils/error";
import { isAbsent } from "@/utils/types";

export const useAgentsStore = defineStore("agents", () => {
  const configStore = useConfigStore();
  const responseEditorStore = useResponseEditorStore();
  const error = ref<string | undefined>(undefined);
  const inputMessage = ref("");

  const createChat = () =>
    new Chat<CustomUIMessage>({
      id: "poc-assistant",
      transport: createLocalAgentTransport({
        getModelId: () => configStore.agentsModel,
        getEditorContent: () => responseEditorStore.content,
      }),
      onError: (err: Error) => {
        error.value = err.message;
      },
    });

  const chat = shallowRef<Chat<CustomUIMessage> | undefined>(createChat());

  watch(
    () => configStore.agentsModel,
    () => {
      chat.value?.stop();
      error.value = undefined;
    },
  );

  const agent = computed(() => {
    const current = chat.value;
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
    chat.value?.stop();
  };

  const truncateMessages = (index: number) => {
    const current = chat.value;
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
  };
});
