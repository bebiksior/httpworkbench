<script setup lang="ts">
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { Codemirror } from "vue-codemirror";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const extensions = [html(), oneDark, EditorView.lineWrapping];

const handleChange = (value: string) => {
  emit("update:modelValue", value);
};
</script>

<template>
  <div class="h-full w-full overflow-hidden bg-white dark:bg-surface-900">
    <Codemirror
      :model-value="props.modelValue"
      :extensions="extensions"
      :autofocus="true"
      :spellcheck="false"
      :indent-with-tab="true"
      :tab-size="2"
      class="h-full"
      @update:modelValue="handleChange"
    />
  </div>
</template>

<style>
/* Ensure CodeMirror takes full height */
.cm-editor {
  height: 100%;
}
.cm-scroller {
  overflow: auto;
}
</style>
