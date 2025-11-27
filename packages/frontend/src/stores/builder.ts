import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import { useResponseEditorStore } from "./responseEditor";

export const DEFAULT_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>PoC Demo</title>
  </head>
  <body>
    <main>
      <h1>Payload Preview</h1>
      <button id="poc-button">Click Me</button>
    </main>
    <script>
      document.getElementById("poc-button")?.addEventListener("click", () => {
        alert("PoC executed");
      });
    </script>
  </body>
</html>`;

const extractBody = (raw: string | undefined) => {
  if (raw === undefined || raw === "") {
    return "";
  }
  const match = /\r?\n\r?\n/.exec(raw);
  if (match?.index === undefined) {
    return raw;
  }
  return raw.slice(match.index + match[0].length);
};

export const formatResponse = (body: string) => {
  return ["HTTP/1.1 200 OK", "Content-Type: text/html", "", body].join("\n");
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
    const body = extractBody(raw);
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
