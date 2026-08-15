import { defineStore, storeToRefs } from "pinia";
import { ref, watch } from "vue";
import {
  extractHttpBody,
  formatStaticHttpResponse,
} from "@/utils/httpResponse";
import { useResponseEditorStore } from "./responseEditor";

export const DEFAULT_TEMPLATE = `<h1>Hello World</h1>`;

export const formatResponse = (body: string) => {
  return formatStaticHttpResponse({
    body,
    contentType: "text/html",
  });
};

export const useBuilderStore = defineStore("builder", () => {
  const showPreview = ref(false);
  const showAssistant = ref(true);
  const previewKey = ref(0);
  const isDirty = ref(false);

  const responseEditorStore = useResponseEditorStore();
  const { content: editorContent } = storeToRefs(responseEditorStore);

  watch(
    () =>
      [
        responseEditorStore.content,
        responseEditorStore.lastUpdateOrigin,
      ] as const,
    ([, origin]) => {
      isDirty.value = origin !== "hydrate";
    },
    { flush: "sync" },
  );

  const refreshPreview = () => {
    previewKey.value += 1;
  };

  const toggleAssistant = () => {
    showAssistant.value = !showAssistant.value;
  };

  const setEditorContent = (value: string, origin: "user" | "agent") => {
    responseEditorStore.setContent(value, origin);
  };

  const hydrateEditor = (raw: string) => {
    const body = extractHttpBody(raw);
    responseEditorStore.setContent(
      body.trim() === "" ? DEFAULT_TEMPLATE : body,
      "hydrate",
    );
  };

  const reset = () => {
    showPreview.value = false;
    showAssistant.value = true;
    previewKey.value = 0;
    isDirty.value = false;
    responseEditorStore.setContent(DEFAULT_TEMPLATE, "hydrate");
  };

  return {
    showPreview,
    showAssistant,
    previewKey,
    isDirty,
    editorContent,
    refreshPreview,
    toggleAssistant,
    setEditorContent,
    hydrateEditor,
    reset,
  };
});
