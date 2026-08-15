<script setup lang="ts">
import Button from "primevue/button";
import { useNotify } from "@/composables";
import { useBuilderPageContext } from "@/pages/PoCBuilder/useBuilderPage";

const { previewUrl } = useBuilderPageContext();
const notify = useNotify();

const copyUrl = async () => {
  if (previewUrl.value === undefined) {
    return;
  }
  await navigator.clipboard.writeText(previewUrl.value);
  notify.success("URL copied to clipboard");
};

const openInNewTab = () => {
  if (previewUrl.value === undefined) {
    return;
  }
  window.open(previewUrl.value, "_blank", "noopener");
};
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-1">
    <template v-if="previewUrl !== undefined">
      <span
        class="min-w-0 truncate font-mono text-xs text-surface-500 dark:text-surface-400"
        :title="previewUrl"
        >{{ previewUrl }}</span
      >
      <Button
        icon="pi pi-copy"
        severity="secondary"
        text
        size="small"
        class="shrink-0 p-0! w-8! h-8!"
        aria-label="Copy URL"
        @click="copyUrl"
        v-tooltip.top="'Copy URL'"
      />
      <Button
        icon="pi pi-external-link"
        severity="secondary"
        text
        size="small"
        class="shrink-0 p-0! w-8! h-8!"
        aria-label="Open in new tab"
        @click="openInNewTab"
        v-tooltip.top="'Open in new tab'"
      />
    </template>
  </div>
</template>
