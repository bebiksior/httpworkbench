import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
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
  const previewKey = ref(0);
  const isDirty = ref(false);

  const responseEditorStore = useResponseEditorStore();
  const { content: editorContent } = storeToRefs(responseEditorStore);

  const refreshPreview = () => {
    previewKey.value += 1;
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
    previewKey.value = 0;
    isDirty.value = false;
    responseEditorStore.setContent(DEFAULT_TEMPLATE, "hydrate");
  };

  return {
    showPreview,
    previewKey,
    isDirty,
    editorContent,
    refreshPreview,
    setEditorContent,
    hydrateEditor,
    reset,
  };
});
