import { computed } from "vue";
import { useAgentsStore } from "@/stores";
import { getErrorMessage } from "@/utils/error";
import { isAbsent } from "@/utils/types";

export const useChat = () => {
  const agentStore = useAgentsStore();

  const inputMessage = computed({
    get: () => agentStore.inputMessage,
    set: (value: string) => {
      agentStore.inputMessage = value;
    },
  });

  const isEditingMessage = computed(() => agentStore.inputMessage !== "");

  const isAgentIdle = computed(() => {
    const status = agentStore.agent?.status;
    return status === "ready" || status === "error";
  });

  const canSendMessage = computed(() => {
    return isAgentIdle.value && inputMessage.value.trim() !== "";
  });

  const messages = computed(() => {
    if (isAbsent(agentStore.agent)) {
      return [];
    }
    return agentStore.agent.messages;
  });

  const sendMessage = (message: string) => {
    if (isAbsent(agentStore.agent)) {
      return;
    }
    try {
      agentStore.agent.sendMessage({ text: message });
    } catch (error) {
      console.error(getErrorMessage(error));
    }
  };

  const handleSend = () => {
    if (!canSendMessage.value) {
      return;
    }
    const message = inputMessage.value.trim();
    inputMessage.value = "";
    sendMessage(message);
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.stopPropagation();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const abortMessage = () => {
    agentStore.abortAgent();
  };

  const editMessage = (messageId: string, content: string) => {
    const agent = agentStore.agent;
    if (isAbsent(agent)) {
      return;
    }
    agentStore.abortAgent();
    const index = agent.messages.findIndex((m) => m.id === messageId);
    if (index === -1) {
      return;
    }
    agentStore.truncateMessages(index);
    agentStore.inputMessage = content;
  };

  const clearInputMessage = () => {
    agentStore.inputMessage = "";
  };

  return {
    messages,
    inputMessage,
    isEditingMessage,
    isAgentIdle,
    canSendMessage,
    sendMessage,
    abortMessage,
    editMessage,
    clearInputMessage,
    handleSend,
    handleKeydown,
  };
};
