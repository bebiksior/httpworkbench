<script setup lang="ts">
import { ROUTE_METHODS, type RouteMethod } from "shared";
import { computed, ref } from "vue";

const props = defineProps<{
  method?: RouteMethod;
  path: string;
  error?: string;
}>();
const emit = defineEmits<{
  "update:method": [method: RouteMethod | undefined];
  "update:path": [path: string];
}>();

const pathInput = ref<HTMLInputElement>();
const methodWidth = computed(() => `${(props.method ?? "*").length + 4}ch`);

const onMethodChange = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  emit("update:method", value === "" ? undefined : (value as RouteMethod));
};

defineExpose({
  focus: () => {
    pathInput.value?.focus();
    pathInput.value?.select();
  },
});
</script>

<template>
  <label class="relative flex h-7 shrink-0 items-center">
    <select
      :value="method ?? ''"
      aria-label="Method"
      :style="{ width: methodWidth }"
      class="h-7 cursor-pointer appearance-none rounded-sm bg-transparent pr-5 pl-2 font-mono text-xs! text-surface-700 outline-none transition-colors hover:bg-surface-100 focus-visible:bg-surface-100 dark:text-surface-300 dark:[color-scheme:dark] dark:hover:bg-surface-800 dark:focus-visible:bg-surface-800"
      @change="onMethodChange"
    >
      <option value="">*</option>
      <option v-for="option in ROUTE_METHODS" :key="option" :value="option">
        {{ option }}
      </option>
    </select>
    <i
      class="pi pi-chevron-down pointer-events-none absolute right-1.5 text-[8px]! text-surface-400!"
    />
  </label>
  <input
    ref="pathInput"
    :value="path"
    type="text"
    spellcheck="false"
    autocomplete="off"
    aria-label="Path"
    :aria-invalid="error !== undefined"
    placeholder="/path or /prefix/*"
    class="h-7 w-72 min-w-0 shrink rounded-sm bg-transparent px-2 font-mono text-[13px]! outline-none transition-colors placeholder:text-surface-400 hover:bg-surface-100 focus:bg-surface-100 dark:hover:bg-surface-800 dark:focus:bg-surface-800"
    :class="
      error === undefined
        ? 'text-surface-900 dark:text-surface-0'
        : 'text-red-600 dark:text-red-400'
    "
    @input="emit('update:path', ($event.target as HTMLInputElement).value)"
    @keydown.enter="($event.target as HTMLInputElement).blur()"
  />
  <span v-if="error" class="shrink-0 text-xs text-red-600 dark:text-red-400">
    {{ error }}
  </span>
</template>
