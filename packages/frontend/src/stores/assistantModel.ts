import { defineStore } from "pinia";
import { ref } from "vue";

export const useAssistantModelStore = defineStore("assistantModel", () => {
  const agentsModel = ref("openrouter:google/gemini-3.7-flash");

  return {
    agentsModel,
  };
});
