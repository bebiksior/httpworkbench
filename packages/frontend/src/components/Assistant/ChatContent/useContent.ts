import { computed } from "vue";
import { useAgentsStore } from "@/stores";

export const useContent = () => {
  const agentStore = useAgentsStore();

  const messages = computed(() => {
    if (agentStore.agent === undefined) {
      return [];
    }
    const messages = agentStore.agent.messages;
    return messages;
  });

  const hasMessages = computed(() => messages.value.length > 0);
  const agentStatus = computed(() => agentStore.agent?.status);
  const error = computed(() => agentStore.agent?.error);

  return {
    messages,
    hasMessages,
    agentStatus,
    error,
  };
};
