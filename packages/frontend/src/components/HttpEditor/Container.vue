<script setup lang="ts">
import { StreamLanguage } from "@codemirror/language";
import { http } from "@codemirror/legacy-modes/mode/http";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { computed, toRefs } from "vue";
import { Codemirror } from "vue-codemirror";
import { httpEditorExtensions } from "./extensions";
import { createSaveKeymap } from "./extensions/saveKeymap";

const props = defineProps<{
  modelValue: string;
  readonly?: boolean;
  autoHeight?: boolean;
  maxHeight?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "save"): void;
}>();

const { modelValue, readonly, autoHeight, maxHeight } = toRefs(props);

const handleSave = () => {
  emit("save");
};

const extensions = computed(() => {
  const exts = [StreamLanguage.define(http), oneDark, EditorView.lineWrapping];
  if (!readonly.value) {
    exts.push(...httpEditorExtensions);
    exts.push(createSaveKeymap(handleSave));
  }
  if (readonly.value) {
    exts.push(EditorState.readOnly.of(true));
    exts.push(EditorView.editable.of(false));
  }
  return exts;
});

const handleChange = (value: string) => {
  emit("update:modelValue", value);
};

const editorStyle = computed(() => {
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
    :class="{ 'h-full': !autoHeight }"
  >
    <Codemirror
      :model-value="modelValue"
      :extensions="extensions"
      :style="editorStyle"
      :autofocus="!readonly"
      :indent-with-tab="true"
      :tab-size="2"
      @update:modelValue="handleChange"
    />
  </div>
</template>

<style>
.http-editor .cm-editor {
  height: 100%;
}
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
</style>
