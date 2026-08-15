<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import { PoCEditor } from "@/components/PoCEditor";
import { Assistant } from "@/components/Assistant";
import { useAuthStore, useBuilderStore, useThemeStore } from "@/stores";
import { BuilderActions } from "@/pages/PoCBuilder/components/BuilderActions";
import { BuilderUrl } from "@/pages/PoCBuilder/components/BuilderUrl";
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
const { editorContent } = storeToRefs(builderStore);

const handleEditorChange = (value: string) => {
  builderStore.setEditorContent(value, "user");
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
      :size="showAssistant ? 65 : 100"
      :min-size="40"
      :max-size="showAssistant ? 80 : 100"
      class="overflow-hidden"
    >
      <div
        class="h-full flex flex-col bg-white dark:bg-surface-900 overflow-hidden rounded-lg"
      >
        <div
          class="h-10 pl-3 pr-2 flex items-center gap-2 shrink-0 border-b border-surface-200 dark:border-surface-800"
        >
          <BuilderUrl />
          <BuilderActions show-preview-toggle />
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
      v-if="showAssistant"
      :size="35"
      :min-size="20"
      class="overflow-hidden"
    >
      <div
        class="h-full flex flex-col bg-white dark:bg-surface-900 overflow-hidden rounded-lg"
      >
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
