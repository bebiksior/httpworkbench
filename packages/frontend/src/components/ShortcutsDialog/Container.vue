<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import Dialog from "primevue/dialog";
import { computed } from "vue";

const visible = defineModel<boolean>("visible", { default: false });

const props = defineProps<{
  canSearchInstances: boolean;
}>();

const modKey = /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘" : "Ctrl";

const shortcuts = computed(() => [
  ...(props.canSearchInstances
    ? [{ label: "Search instances", keys: [modKey, "K"] }]
    : []),
  { label: "Save changes", keys: [modKey, "S"] },
  { label: "Close dialog or panel", keys: ["Esc"] },
  { label: "Show keyboard shortcuts", keys: ["Shift", "?"] },
]);

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
};

useEventListener(document, "keydown", (event) => {
  if (
    event.key !== "?" ||
    !event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    isEditableTarget(event.target)
  ) {
    return;
  }

  event.preventDefault();
  visible.value = true;
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissable-mask
    :draggable="false"
    header="Keyboard shortcuts"
    :style="{ width: 'min(26rem, calc(100vw - 2rem))' }"
  >
    <dl class="flex flex-col gap-1">
      <div
        v-for="item in shortcuts"
        :key="item.label"
        class="flex min-h-8 items-center justify-between gap-6"
      >
        <dt class="text-sm text-surface-700 dark:text-surface-200">
          {{ item.label }}
        </dt>
        <dd class="flex shrink-0 items-center gap-1.5">
          <kbd
            v-for="key in item.keys"
            :key="key"
            class="inline-flex h-7 min-w-7 items-center justify-center whitespace-nowrap rounded-md border border-surface-200 bg-surface-50 px-2 text-xs font-medium leading-none text-surface-700 shadow-sm dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200"
          >
            {{ key }}
          </kbd>
        </dd>
      </div>
    </dl>
  </Dialog>
</template>
