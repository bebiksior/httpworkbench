import { defineStore } from "pinia";
import { ref } from "vue";

export const useAssistantModelStore = defineStore("assistantModel", () => {
  const agentsModel = ref("google/gemini-3-flash-preview");

  return {
    agentsModel,
  };
});
