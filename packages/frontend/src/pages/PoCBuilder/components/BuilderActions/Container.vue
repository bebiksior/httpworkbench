<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import { useBuilderPageContext } from "@/pages/PoCBuilder/useBuilderPage";
import { useBuilderStore } from "@/stores";

defineProps<{
  previewToggleId?: string;
}>();

const builderStore = useBuilderStore();
const { showPreview, isDirty } = storeToRefs(builderStore);
const { previewUrl, isSaving, handleSave, handleBack } =
  useBuilderPageContext();

const openPreviewInNewTab = () => {
  if (previewUrl.value !== undefined) {
    window.open(previewUrl.value, "_blank");
  }
};
</script>

<template>
  <div class="flex gap-1 items-center">
    <div
      v-if="previewToggleId !== undefined"
      class="flex items-center gap-1.5 mr-1"
    >
      <Checkbox v-model="showPreview" binary :input-id="previewToggleId" />
      <label
        :for="previewToggleId"
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
      aria-label="Open in new tab"
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
      aria-label="Close"
      @click="handleBack()"
      v-tooltip.top="'Close'"
    />
  </div>
</template>
