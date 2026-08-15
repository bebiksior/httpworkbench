import { defineStore } from "pinia";
import { ref } from "vue";
import type { ReasoningEffort } from "@/agent/types/config";

export const useAssistantModelStore = defineStore("assistantModel", () => {
  const agentsModel = ref("openrouter:google/gemini-3.7-flash");
  const agentsReasoningEffort = ref<ReasoningEffort>("high");

  return {
    agentsModel,
    agentsReasoningEffort,
  };
});
