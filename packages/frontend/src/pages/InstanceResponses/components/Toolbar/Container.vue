<script setup lang="ts">
import Button from "primevue/button";
import type { RouteMethod } from "shared";
import { ref } from "vue";
import { useNotify } from "@/composables";
import { useFileUpload } from "@/pages/InstanceDetail/components/InstanceData/useFileUpload";
import type { RouteDraft } from "../../responseRoutes";
import { RouteFields } from "../RouteFields";

const props = defineProps<{
  route?: RouteDraft;
  error?: string;
  url: string;
  isDirty: boolean;
  canSave: boolean;
  isUpdating: boolean;
}>();
const emit = defineEmits<{
  method: [method: RouteMethod | undefined];
  path: [path: string];
  content: [raw: string];
  remove: [];
  save: [];
  close: [];
}>();

const notify = useNotify();
const { processFile } = useFileUpload();
const fields = ref<InstanceType<typeof RouteFields>>();
const fileInput = ref<HTMLInputElement>();

const copyUrl = async () => {
  await navigator.clipboard.writeText(props.url);
  if (props.route !== undefined && props.route.saved === undefined) {
    notify.success("Copied. Save to make this path live");
    return;
  }
  notify.copied();
};

const openUrl = () => {
  window.open(props.url, "_blank", "noopener");
};

const onFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file === undefined) return;
  try {
    emit("content", await processFile(file));
  } catch (error) {
    notify.error("Failed to process file", error);
  } finally {
    input.value = "";
  }
};

defineExpose({ focusPath: () => fields.value?.focus() });
</script>

<template>
  <div
    class="flex h-10 shrink-0 items-center gap-1 border-b border-surface-200 px-2 dark:border-surface-800"
  >
    <RouteFields
      v-if="route"
      ref="fields"
      :method="route.method"
      :path="route.path"
      :error="error"
      @update:method="emit('method', $event)"
      @update:path="emit('path', $event)"
    />
    <span
      v-else
      class="flex h-7 items-center pl-2 text-[13px] text-surface-900 dark:text-surface-0"
    >
      Default
    </span>

    <div class="flex min-w-0 flex-1 items-center justify-end gap-1">
      <span
        class="hidden min-w-0 truncate font-mono text-xs text-surface-400 md:inline dark:text-surface-500"
        :title="url"
      >
        {{ url }}
      </span>
      <Button
        icon="pi pi-copy"
        severity="secondary"
        text
        size="small"
        class="h-8! w-8! shrink-0 p-0!"
        aria-label="Copy URL"
        v-tooltip.top="'Copy URL'"
        @click="copyUrl"
      />
      <Button
        icon="pi pi-external-link"
        severity="secondary"
        text
        size="small"
        class="h-8! w-8! shrink-0 p-0!"
        aria-label="Open in new tab"
        v-tooltip.top="'Open in new tab'"
        @click="openUrl"
      />
      <input
        ref="fileInput"
        type="file"
        class="hidden"
        accept=".txt,.json,.xml,.html,.js,.css,.svg"
        @change="onFileSelected"
      />
      <Button
        icon="pi pi-upload"
        severity="secondary"
        text
        size="small"
        class="h-8! w-8! shrink-0 p-0!"
        aria-label="Upload file as response"
        v-tooltip.top="'Upload file as response'"
        @click="fileInput?.click()"
      />
      <Button
        v-if="route"
        icon="pi pi-trash"
        severity="secondary"
        text
        size="small"
        class="h-8! w-8! shrink-0 p-0! hover:text-red-600! dark:hover:text-red-400!"
        aria-label="Remove path"
        v-tooltip.top="'Remove path'"
        @click="emit('remove')"
      />
    </div>

    <span class="mx-1 h-4 w-px shrink-0 bg-surface-200 dark:bg-surface-800" />
    <Button
      label="Save"
      :severity="isDirty ? 'primary' : 'secondary'"
      size="small"
      :disabled="!canSave"
      :loading="isUpdating"
      class="h-7! shrink-0 px-2.5! text-xs!"
      v-tooltip.top="'Save (⌘S)'"
      @click="emit('save')"
    />
    <Button
      icon="pi pi-times"
      severity="secondary"
      text
      size="small"
      class="h-7! w-7! shrink-0 p-0! text-xs!"
      aria-label="Close"
      v-tooltip.top="'Close'"
      @click="emit('close')"
    />
  </div>
</template>
