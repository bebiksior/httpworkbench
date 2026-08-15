<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import { computed } from "vue";
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
const { isSaving, isAiEnabled, showAssistant, handleBack } =
  useBuilderPageContext();
const saveStatus = computed(() =>
  isSaving.value || isDirty.value ? "Saving..." : "Saved",
);
</script>

<template>
  <div class="flex shrink-0 items-center gap-1">
    <span
      class="w-12 shrink-0 text-right text-xs text-surface-400 dark:text-surface-500"
      role="status"
      aria-live="polite"
    >
      {{ saveStatus }}
    </span>
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
      v-if="isAiEnabled"
      icon="pi pi-sparkles"
      severity="secondary"
      text
      size="small"
      class="p-0! w-8! h-8!"
      :class="
        showAssistant
          ? 'bg-surface-100! dark:bg-surface-800! text-primary!'
          : ''
      "
      :aria-pressed="showAssistant"
      :aria-label="showAssistant ? 'Hide assistant' : 'Show assistant'"
      aria-keyshortcuts="Meta+I Control+I"
      @click="builderStore.toggleAssistant()"
      v-tooltip.top="
        showAssistant ? 'Hide assistant (⌘I)' : 'Show assistant (⌘I)'
      "
    />
    <Button
      icon="pi pi-times"
      severity="secondary"
      text
      size="small"
      class="p-0! w-7! h-7! text-xs!"
      aria-label="Close builder"
      @click="handleBack()"
      v-tooltip.top="'Close'"
    />
  </div>
</template>
