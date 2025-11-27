import { defineStore } from "pinia";
import { ref } from "vue";

type ResponseEditorUpdateOrigin = "hydrate" | "user" | "agent";

export const useResponseEditorStore = defineStore("responseEditor", () => {
  const content = ref("");
  const lastUpdateOrigin = ref<ResponseEditorUpdateOrigin>("hydrate");
  const lastUpdatedAt = ref<number | undefined>(undefined);

  const setContent = (value: string, origin: ResponseEditorUpdateOrigin) => {
    content.value = value;
    lastUpdateOrigin.value = origin;
    lastUpdatedAt.value = Date.now();
  };

  return {
    content,
    lastUpdateOrigin,
    lastUpdatedAt,
    setContent,
  };
});
