<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import { useBuilderPageContext } from "@/pages/PoCBuilder/useBuilderPage";
import { useBuilderStore } from "@/stores";

withDefaults(
  defineProps<{
    showPreviewToggle?: boolean;
  }>(),
  { showPreviewToggle: false },
);

const builderStore = useBuilderStore();
const { showPreview, isDirty } = storeToRefs(builderStore);
const { isSaving, handleSave, handleBack } = useBuilderPageContext();
</script>

<template>
  <div class="flex shrink-0 items-center gap-1">
    <Button
      v-if="showPreviewToggle"
      icon="pi pi-eye"
      severity="secondary"
      text
      size="small"
      class="p-0! w-8! h-8!"
      :class="
        showPreview ? 'bg-surface-100! dark:bg-surface-800! text-primary!' : ''
      "
      :aria-pressed="showPreview"
      :aria-label="showPreview ? 'Hide preview' : 'Show preview'"
      @click="showPreview = !showPreview"
      v-tooltip.top="showPreview ? 'Hide preview' : 'Show preview'"
    />
    <Button
      label="Save"
      size="small"
      class="h-8! px-3!"
      :loading="isSaving"
      :disabled="!isDirty"
      @click="handleSave()"
    />
    <Button
      icon="pi pi-times"
      severity="secondary"
      text
      size="small"
      class="p-0! w-8! h-8!"
      aria-label="Close builder"
      @click="handleBack()"
      v-tooltip.top="'Close'"
    />
  </div>
</template>
