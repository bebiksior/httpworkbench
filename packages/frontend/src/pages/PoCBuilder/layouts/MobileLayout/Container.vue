<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import { PoCEditor } from "@/components/PoCEditor";
import { Assistant } from "@/components/Assistant";
import { useBuilderStore } from "@/stores";
import { useBuilderPageContext } from "@/pages/PoCBuilder/useBuilderPage";
import { useNotify } from "@/composables";

const builderStore = useBuilderStore();
const { isDirty, editorContent } = storeToRefs(builderStore);
const { previewUrl, isSaving, handleSave, handleBack } =
  useBuilderPageContext();
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

const openPreviewInNewTab = () => {
  if (previewUrl.value !== undefined) {
    window.open(previewUrl.value, "_blank");
  }
};
</script>

<template>
  <div class="flex flex-col h-full gap-1.5">
    <div
      class="rounded-lg flex flex-col bg-white dark:bg-surface-900 overflow-hidden h-1/2 shrink-0 border border-surface-200 dark:border-surface-700"
    >
      <div
        class="h-10 px-3 flex items-center justify-between shrink-0 border-b border-surface-200 dark:border-surface-800"
      >
        <span
          class="text-sm font-medium text-surface-600 dark:text-surface-400"
        >
          Code
        </span>
        <div class="flex items-center gap-2" v-if="previewUrl">
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
        <div class="flex gap-1 items-center">
          <Button
            icon="pi pi-external-link"
            severity="secondary"
            text
            size="small"
            :disabled="previewUrl === undefined"
            @click="openPreviewInNewTab"
            v-tooltip.top="'View in new tab'"
          />
          <Button
            label="Save"
            size="small"
            :loading="isSaving"
            :disabled="!isDirty"
            @click="handleSave()"
            v-tooltip.top="'Save'"
            style="padding: 0em 0.75em"
          />
          <Button
            icon="pi pi-times"
            severity="secondary"
            text
            size="small"
            @click="handleBack()"
            v-tooltip.top="'Close'"
          />
        </div>
      </div>

      <div class="flex-1 min-h-0 py-2">
        <Assistant />
      </div>
    </div>
  </div>
</template>
