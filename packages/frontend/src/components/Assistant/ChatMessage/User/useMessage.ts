import { computed } from "vue";
import type { CustomUIMessage } from "@/agent/types";
import { useAgentsStore } from "@/stores";

type MessagePartLike = { type: string; text?: string };

export const useUserMessage = () => {
  const agentStore = useAgentsStore();
  const agent = computed(() => agentStore.agent);

  const isGenerating = computed(() => {
    return agent.value?.status === "streaming";
  });

  const handleMessageClick = async (
    message: CustomUIMessage & { role: "user" },
  ) => {
    const currentAgent = agent.value;
    if (currentAgent === undefined) {
      return;
    }
    await agentStore.abortAgent();
    const index = currentAgent.messages.findIndex((m) => m.id === message.id);
    if (index === -1) {
      return;
    }

    const text = (message.parts as MessagePartLike[])
      .filter((p) => p?.type === "text" && p.text !== undefined)
      .map((p) => p?.text ?? "")
      .join("");

    setTimeout(() => {
      agentStore.truncateMessages(index);
    }, 100);

    agentStore.inputMessage = text;
  };

  return {
    isGenerating,
    handleMessageClick,
  };
};
