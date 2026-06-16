<script setup lang="ts">
import {
  EditorSelection,
  Transaction,
  type EditorState,
} from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { computed, nextTick, ref, toRefs, watch } from "vue";
import { Codemirror } from "vue-codemirror";
import { useThemeStore } from "@/stores/theme";
import { getEditorLanguageExtension, type EditorSyntax } from "./language";
import { httpEditorExtensions } from "./extensions";
import { disableGrammarlyExtension } from "./extensions/disableGrammarly";
import { readonlyEditorExtensions } from "./extensions/readonly";
import { createSaveKeymap } from "./extensions/saveKeymap";
import { oneLight } from "./extensions/lightTheme";

const themeStore = useThemeStore();

const props = defineProps<{
  modelValue: string;
  readonly?: boolean;
  autoHeight?: boolean;
  maxHeight?: string;
  height?: string;
  isDirty?: boolean;
  syntax?: EditorSyntax;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "save"): void;
}>();

const { modelValue, readonly, autoHeight, maxHeight, height, isDirty, syntax } =
  toRefs(props);
const editorView = ref<EditorView>();
const preservedSelection = ref<EditorSelection>();

const handleSave = () => {
  emit("save");
};

const extensions = computed(() => {
  const editorTheme = themeStore.mode === "dark" ? oneDark : oneLight;
  const exts = [
    getEditorLanguageExtension(syntax.value),
    editorTheme,
    EditorView.lineWrapping,
    disableGrammarlyExtension,
  ];
  if (!readonly.value) {
    exts.push(...httpEditorExtensions);
    exts.push(
      createSaveKeymap({
        onSave: handleSave,
        canSave: () => isDirty.value ?? true,
      }),
    );
  }
  if (readonly.value) {
    exts.push(...readonlyEditorExtensions);
  }
  if (height.value !== undefined) {
    exts.push(
      EditorView.theme({
        "&": { height: height.value },
        ".cm-scroller": { overflow: "auto" },
      }),
    );
  }
  return exts;
});

const handleChange = (value: string) => {
  emit("update:modelValue", value);
};

const handleReady = ({ view }: { view: EditorView; state: EditorState }) => {
  editorView.value = view;
  preservedSelection.value = view.state.selection;
};

const isExternalDocumentSync = (update: ViewUpdate) => {
  return (
    update.docChanged &&
    update.transactions.every(
      (transaction) =>
        transaction.annotation(Transaction.userEvent) === undefined,
    )
  );
};

const handleUpdate = (update: ViewUpdate) => {
  if (isExternalDocumentSync(update)) {
    return;
  }

  preservedSelection.value = update.state.selection;
};

const restoreSelection = (view: EditorView, selection: EditorSelection) => {
  const docLength = view.state.doc.length;
  const clipPosition = (position: number) => Math.min(position, docLength);
  const ranges = selection.ranges.map((range) =>
    EditorSelection.range(clipPosition(range.anchor), clipPosition(range.head)),
  );

  view.dispatch({
    selection: EditorSelection.create(ranges, selection.mainIndex),
  });
};

watch(modelValue, async () => {
  const view = editorView.value;
  const selection = preservedSelection.value;
  if (view === undefined || selection === undefined || !view.hasFocus) {
    return;
  }

  await nextTick();
  if (view.state.doc.toString() !== modelValue.value) {
    return;
  }

  restoreSelection(view, selection);
});

const editorStyle = computed(() => {
  if (height.value !== undefined) {
    return {};
  }

  const style: Record<string, string> = {
    height: autoHeight.value ? "auto" : "100%",
    minHeight: autoHeight.value ? "50px" : "200px",
  };

  if (maxHeight.value !== undefined) {
    style.maxHeight = maxHeight.value;
  }

  return style;
});
</script>

<template>
  <div
    class="http-editor overflow-hidden rounded-md border border-surface-200 dark:border-surface-700"
    :class="{ 'h-full': !autoHeight && height === undefined }"
  >
    <Codemirror
      :model-value="modelValue"
      :extensions="extensions"
      :style="editorStyle"
      :autofocus="!readonly"
      :indent-with-tab="true"
      :tab-size="2"
      @ready="handleReady"
      @update="handleUpdate"
      @update:modelValue="handleChange"
    />
  </div>
</template>

<style>
.http-editor.h-full .cm-editor {
  height: 100%;
}
.http-editor .cm-scroller {
  font-family: "Menlo", "Monaco", "Courier New", monospace;
}
.cm-inline-hint {
  opacity: 0.4;
  pointer-events: none;
}
.http-editor .cm-content .cm-response-body-html.tok-string,
.http-editor .cm-content .cm-response-body-json.tok-string {
  color: rgb(152, 195, 121);
}
.http-editor .cm-content .cm-response-body-html.tok-attributeName,
.http-editor .cm-content .cm-response-body-html.tok-propertyName,
.http-editor .cm-content .cm-response-body-html.tok-labelName,
.http-editor .cm-content .cm-response-body-json.tok-propertyName {
  color: rgb(224, 108, 117);
}
.http-editor .cm-content .cm-response-body-html.tok-typeName,
.http-editor .cm-content .cm-response-body-html.tok-name {
  color: rgb(229, 192, 123);
}
.http-editor .cm-content .cm-response-body-html.tok-punctuation,
.http-editor .cm-content .cm-response-body-html.tok-angleBracket,
.http-editor .cm-content .cm-response-body-json.tok-punctuation {
  color: rgb(171, 178, 191);
}
.http-editor .cm-content .cm-response-body-html.tok-operator {
  color: rgb(86, 182, 194);
}
.http-editor .cm-content .cm-response-body-html.tok-comment {
  color: rgb(171, 178, 191);
}
.http-editor .cm-content .cm-response-body-json.tok-number,
.http-editor .cm-content .cm-response-body-json.tok-integer,
.http-editor .cm-content .cm-response-body-json.tok-float {
  color: rgb(229, 192, 123);
}
.http-editor .cm-content .cm-response-body-json.tok-bool,
.http-editor .cm-content .cm-response-body-json.tok-null,
.http-editor .cm-content .cm-response-body-json.tok-atom {
  color: rgb(86, 182, 194);
}
.dark .http-editor .cm-content .cm-response-body-html.tok-string,
.dark .http-editor .cm-content .cm-response-body-json.tok-string {
  color: rgb(152, 195, 121);
}
.dark .http-editor .cm-content .cm-response-body-html.tok-attributeName,
.dark .http-editor .cm-content .cm-response-body-html.tok-propertyName,
.dark .http-editor .cm-content .cm-response-body-html.tok-labelName,
.dark .http-editor .cm-content .cm-response-body-json.tok-propertyName {
  color: rgb(224, 108, 117);
}
.dark .http-editor .cm-content .cm-response-body-html.tok-typeName,
.dark .http-editor .cm-content .cm-response-body-html.tok-name {
  color: rgb(229, 192, 123);
}
.dark .http-editor .cm-content .cm-response-body-html.tok-punctuation,
.dark .http-editor .cm-content .cm-response-body-html.tok-angleBracket,
.dark .http-editor .cm-content .cm-response-body-json.tok-punctuation {
  color: rgb(171, 178, 191);
}
.dark .http-editor .cm-content .cm-response-body-html.tok-operator {
  color: rgb(86, 182, 194);
}
.dark .http-editor .cm-content .cm-response-body-html.tok-comment {
  color: rgb(171, 178, 191);
}
.dark .http-editor .cm-content .cm-response-body-json.tok-number,
.dark .http-editor .cm-content .cm-response-body-json.tok-integer,
.dark .http-editor .cm-content .cm-response-body-json.tok-float {
  color: rgb(229, 192, 123);
}
.dark .http-editor .cm-content .cm-response-body-json.tok-bool,
.dark .http-editor .cm-content .cm-response-body-json.tok-null,
.dark .http-editor .cm-content .cm-response-body-json.tok-atom {
  color: rgb(86, 182, 194);
}
</style>
