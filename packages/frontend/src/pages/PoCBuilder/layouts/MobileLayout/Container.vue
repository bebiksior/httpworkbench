<script setup lang="ts">
import { storeToRefs } from "pinia";
import { PoCEditor } from "@/components/PoCEditor";
import { useBuilderStore } from "@/stores";
import { BuilderActions } from "@/pages/PoCBuilder/components/BuilderActions";
import { BuilderAssistant } from "@/pages/PoCBuilder/components/BuilderAssistant";
import { BuilderUrl } from "@/pages/PoCBuilder/components/BuilderUrl";
import { useBuilderPageContext } from "@/pages/PoCBuilder/useBuilderPage";

const builderStore = useBuilderStore();
const { editorContent } = storeToRefs(builderStore);
const { showAssistant } = useBuilderPageContext();

const handleEditorChange = (value: string) => {
  builderStore.setEditorContent(value, "user");
};
</script>

<template>
  <div class="flex flex-col h-full gap-1.5">
    <div
      class="rounded-lg flex flex-col bg-white dark:bg-surface-900 overflow-hidden border border-surface-200 dark:border-surface-700"
      :class="showAssistant ? 'h-1/2 shrink-0' : 'flex-1 min-h-0'"
    >
      <div
        class="h-10 pl-3 pr-2 flex items-center gap-2 shrink-0 border-b border-surface-200 dark:border-surface-800"
      >
        <BuilderUrl />
        <BuilderActions />
      </div>
      <div class="flex-1 min-h-0">
        <PoCEditor
          :model-value="editorContent"
          @update:modelValue="handleEditorChange"
        />
      </div>
    </div>

    <div
      v-if="showAssistant"
      class="rounded-lg flex flex-col bg-white dark:bg-surface-900 overflow-hidden h-1/2 shrink-0 border border-surface-200 dark:border-surface-700"
    >
      <BuilderAssistant />
    </div>
  </div>
</template>
