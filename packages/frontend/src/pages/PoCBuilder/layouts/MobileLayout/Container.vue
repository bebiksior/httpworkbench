<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import { PoCEditor } from "@/components/PoCEditor";
import { Assistant } from "@/components/Assistant";
import { useAuthStore, useBuilderStore } from "@/stores";
import { BuilderActions } from "@/pages/PoCBuilder/components/BuilderActions";
import { useBuilderPageContext } from "@/pages/PoCBuilder/useBuilderPage";
import { useNotify } from "@/composables";
import { useAiSettings } from "@/utils/ai";

const authStore = useAuthStore();
const { isGuest } = storeToRefs(authStore);

const { isEnabled: showAssistant } = useAiSettings();

const builderStore = useBuilderStore();
const { editorContent } = storeToRefs(builderStore);
const { previewUrl } = useBuilderPageContext();
const notify = useNotify();

const handleEditorChange = (value: string) => {
  builderStore.setEditorContent(value, "user");
};

const copyUrl = async () => {
  if (previewUrl.value !== undefined) {
    await navigator.clipboard.writeText(previewUrl.value);
    notify.success("URL copied to clipboard");
  }
};
</script>

<template>
  <div class="flex flex-col h-full gap-1.5">
    <div
      class="rounded-lg flex flex-col bg-white dark:bg-surface-900 overflow-hidden border border-surface-200 dark:border-surface-700"
      :class="showAssistant ? 'h-1/2 shrink-0' : 'flex-1 min-h-0'"
    >
      <div
        class="h-10 px-3 flex items-center justify-between shrink-0 border-b border-surface-200 dark:border-surface-800 gap-2"
      >
        <span
          class="text-sm font-medium text-surface-600 dark:text-surface-400"
        >
          Code
        </span>
        <div class="flex items-center gap-2 min-w-0">
          <template v-if="previewUrl">
            <span
              class="text-xs text-surface-500 font-mono max-w-[350px] truncate"
              :title="previewUrl"
              >{{ previewUrl }}</span
            >
            <Button
              icon="pi pi-copy"
              text
              severity="secondary"
              size="small"
              class="shrink-0 p-0! w-6! h-6!"
              @click="copyUrl"
              v-tooltip.top="'Copy URL'"
            />
          </template>
          <BuilderActions v-if="!showAssistant" />
        </div>
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
      <div
        class="h-10 px-3 flex items-center justify-between shrink-0 border-b border-surface-200 dark:border-surface-800"
      >
        <span
          class="text-sm font-medium text-surface-600 dark:text-surface-400"
        >
          Assistant
        </span>
        <BuilderActions />
      </div>

      <div class="flex-1 min-h-0 py-2">
        <div
          v-if="isGuest"
          class="h-full flex items-center justify-center text-surface-500 text-sm px-4 text-center"
        >
          Assistant is not available in guest mode.
        </div>
        <Assistant v-else />
      </div>
    </div>
  </div>
</template>
