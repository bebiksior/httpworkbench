<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import Checkbox from "primevue/checkbox";
import { PoCEditor } from "@/components/PoCEditor";
import { Assistant } from "@/components/Assistant";
import { useBuilderStore } from "@/stores";
import { useBuilderPageContext } from "@/pages/PoCBuilder/useBuilderPage";
import { useNotify } from "@/composables";

const builderStore = useBuilderStore();
const { showPreview, previewKey, isDirty, editorContent } =
  storeToRefs(builderStore);
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
  <Splitter
    class="h-full rounded-lg"
    style="border: none; background: none"
    :pt="{ gutter: { style: 'background-color: var(--p-surface-800)' } }"
  >
    <SplitterPanel
      :size="40"
      :min-size="25"
      :max-size="50"
      class="overflow-hidden"
    >
      <div
        class="h-full flex flex-col bg-white dark:bg-surface-900 overflow-hidden rounded-lg"
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
    </SplitterPanel>

    <SplitterPanel
      :size="30"
      :min-size="20"
      :max-size="50"
      class="overflow-hidden"
    >
      <div
        class="h-full flex flex-col bg-white dark:bg-surface-900 overflow-hidden rounded-lg"
      >
        <div
          class="h-10 px-3 flex items-center justify-between shrink-0 border-b border-surface-200 dark:border-surface-800"
        >
          <span
            class="text-sm font-medium text-surface-600 dark:text-surface-400"
          >
            Preview
          </span>
          <div class="flex gap-1">
            <Button
              icon="pi pi-refresh"
              severity="secondary"
              text
              size="small"
              @click="builderStore.refreshPreview()"
              v-tooltip.top="'Refresh preview'"
            />
          </div>
        </div>
        <div class="flex-1 min-h-0 bg-white">
          <iframe
            v-if="previewUrl !== undefined"
            :key="previewKey"
            :src="previewUrl"
            class="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </div>
      </div>
    </SplitterPanel>

    <SplitterPanel :size="30" :min-size="20" class="overflow-hidden">
      <div
        class="h-full flex flex-col bg-white dark:bg-surface-900 overflow-hidden rounded-lg"
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
            <div class="flex items-center gap-1.5 mr-1">
              <Checkbox
                v-model="showPreview"
                binary
                input-id="preview-toggle"
              />
              <label
                for="preview-toggle"
                class="text-xs text-surface-600 dark:text-surface-400 cursor-pointer"
              >
                Preview
              </label>
            </div>
            <Button
              icon="pi pi-external-link"
              severity="secondary"
              text
              size="small"
              :disabled="previewUrl === undefined"
              @click="openPreviewInNewTab"
              v-tooltip.top="'Open in new tab'"
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
    </SplitterPanel>
  </Splitter>
</template>
