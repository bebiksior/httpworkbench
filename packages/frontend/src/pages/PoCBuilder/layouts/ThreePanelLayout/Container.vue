<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import Button from "primevue/button";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import { PoCEditor } from "@/components/PoCEditor";
import { Assistant } from "@/components/Assistant";
import { useAuthStore, useBuilderStore, useThemeStore } from "@/stores";
import { BuilderActions } from "@/pages/PoCBuilder/components/BuilderActions";
import { useBuilderPageContext } from "@/pages/PoCBuilder/useBuilderPage";
import { useNotify } from "@/composables";
import { useAiSettings } from "@/utils/ai";

const authStore = useAuthStore();
const { isGuest } = storeToRefs(authStore);

const { isEnabled: showAssistant } = useAiSettings();

const themeStore = useThemeStore();
const splitterPt = computed(() => ({
  gutter: {
    style: `background-color: var(--p-surface-${themeStore.mode === "dark" ? "800" : "200"})`,
  },
}));

const builderStore = useBuilderStore();
const { previewKey, editorContent } = storeToRefs(builderStore);
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
  <Splitter
    :key="showAssistant ? 'with-assistant' : 'without-assistant'"
    class="h-full rounded-lg"
    style="border: none; background: none"
    :pt="splitterPt"
  >
    <SplitterPanel
      :size="showAssistant ? 40 : 50"
      :min-size="25"
      :max-size="showAssistant ? 50 : 75"
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
      :size="showAssistant ? 30 : 50"
      :min-size="showAssistant ? 20 : 25"
      :max-size="showAssistant ? 50 : 75"
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
          <div class="flex gap-1 items-center">
            <Button
              icon="pi pi-refresh"
              severity="secondary"
              text
              size="small"
              @click="builderStore.refreshPreview()"
              v-tooltip.top="'Refresh preview'"
            />
            <BuilderActions
              v-if="!showAssistant"
              preview-toggle-id="preview-toggle"
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

    <SplitterPanel
      v-if="showAssistant"
      :size="30"
      :min-size="20"
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
            Assistant
          </span>
          <BuilderActions preview-toggle-id="preview-toggle" />
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
    </SplitterPanel>
  </Splitter>
</template>
