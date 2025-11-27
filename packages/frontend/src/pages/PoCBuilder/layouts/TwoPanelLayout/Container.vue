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

const builderStore = useBuilderStore();
const { showPreview, isDirty, editorContent } = storeToRefs(builderStore);
const { isSaving, handleSave, handleBack } = useBuilderPageContext();

const handleEditorChange = (value: string) => {
  builderStore.setEditorContent(value, "user");
};
</script>

<template>
  <Splitter
    class="h-full rounded-lg"
    style="border: none; background: none"
    :pt="{ gutter: { style: 'background-color: var(--p-surface-800)' } }"
  >
    <SplitterPanel
      :size="65"
      :min-size="40"
      :max-size="80"
      class="overflow-hidden"
    >
      <div
        class="h-full flex flex-col bg-white dark:bg-surface-900 overflow-hidden rounded-lg"
      >
        <div
          class="h-10 px-3 flex items-center shrink-0 border-b border-surface-200 dark:border-surface-800"
        >
          <span
            class="text-sm font-medium text-surface-600 dark:text-surface-400"
          >
            Code
          </span>
        </div>
        <div class="flex-1 min-h-0">
          <PoCEditor
            :model-value="editorContent"
            @update:modelValue="handleEditorChange"
          />
        </div>
      </div>
    </SplitterPanel>

    <SplitterPanel :size="35" :min-size="20" class="overflow-hidden">
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
                input-id="preview-toggle-2"
              />
              <label
                for="preview-toggle-2"
                class="text-xs text-surface-600 dark:text-surface-400 cursor-pointer"
              >
                Preview
              </label>
            </div>
            <Button
              icon="pi pi-times"
              severity="secondary"
              text
              size="small"
              @click="handleBack()"
              v-tooltip.top="'Close'"
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
          </div>
        </div>

        <div class="flex-1 min-h-0 py-2">
          <Assistant />
        </div>
      </div>
    </SplitterPanel>
  </Splitter>
</template>
