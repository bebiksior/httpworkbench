<script setup lang="ts">
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { computed } from "vue";
import { Codemirror } from "vue-codemirror";
import { useThemeStore } from "@/stores/theme";
import { oneLight } from "@/components/HttpEditor/extensions/lightTheme";

const themeStore = useThemeStore();

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const extensions = computed(() => {
  const editorTheme = themeStore.mode === "dark" ? oneDark : oneLight;
  return [html(), editorTheme, EditorView.lineWrapping];
});

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
