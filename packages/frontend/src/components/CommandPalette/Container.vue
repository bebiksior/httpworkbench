<script setup lang="ts">
import Dialog from "primevue/dialog";
import { nextTick, ref, watch } from "vue";
import { useCommandPalette } from "./useCommandPalette";

const {
  visible,
  query,
  activeIndex,
  filteredInstances,
  handleSelect,
  handleInputKeydown,
  getInstanceLabel,
} = useCommandPalette();
const inputRef = ref<HTMLInputElement>();
const setInputRef = (element: unknown) => {
  inputRef.value = element instanceof HTMLInputElement ? element : undefined;
};

watch(visible, async (isVisible) => {
  if (!isVisible) return;
  await nextTick();
  inputRef.value?.focus();
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissable-mask
    :show-header="false"
    :style="{ width: 'min(560px, calc(100vw - 2rem))' }"
    content-class="!p-0 overflow-hidden"
    aria-label="Instance command palette"
  >
    <label class="sr-only" for="instance-command-search">
      Search instances
    </label>
    <input
      id="instance-command-search"
      :ref="setInputRef"
      v-model="query"
      type="search"
      role="combobox"
      aria-label="Search instances"
      aria-controls="instance-command-results"
      :aria-expanded="visible"
      :aria-activedescendant="
        activeIndex >= 0 ? `instance-command-${activeIndex}` : undefined
      "
      autocomplete="off"
      placeholder="Search instances..."
      class="w-full border-0 border-b border-surface-200 bg-surface-0 px-4 py-4 text-base text-surface-900 outline-none dark:border-surface-700 dark:bg-surface-900 dark:text-surface-0"
      @keydown="handleInputKeydown"
    />

    <div
      id="instance-command-results"
      role="listbox"
      aria-label="Instances"
      class="max-h-80 overflow-y-auto bg-surface-0 p-2 dark:bg-surface-900"
    >
      <p
        v-if="filteredInstances.length === 0"
        class="px-3 py-8 text-center text-sm text-surface-500"
      >
        No instances found.
      </p>
      <button
        v-for="(instance, index) in filteredInstances"
        :id="`instance-command-${index}`"
        :key="instance.id"
        type="button"
        role="option"
        :aria-selected="activeIndex === index"
        class="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left text-surface-700 hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:text-surface-200 dark:hover:bg-surface-700"
        :class="
          activeIndex === index
            ? 'bg-surface-100 text-surface-900 dark:bg-surface-700 dark:text-surface-0'
            : ''
        "
        @mouseenter="activeIndex = index"
        @focus="activeIndex = index"
        @click="handleSelect(instance)"
      >
        <i class="pi pi-server text-surface-400" aria-hidden="true" />
        <span>{{ getInstanceLabel(instance) }}</span>
        <span
          v-if="instance.label !== undefined && instance.label !== ''"
          class="text-xs font-mono text-surface-500"
        >
          {{ instance.id }}
        </span>
      </button>
    </div>
  </Dialog>
</template>
