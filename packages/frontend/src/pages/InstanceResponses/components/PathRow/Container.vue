<script setup lang="ts">
import type { RouteMethod } from "shared";
import { computed } from "vue";

const props = defineProps<{
  method?: RouteMethod;
  path: string;
  status?: string;
  active: boolean;
  error?: string;
}>();
defineEmits<{ select: [] }>();

const segments = computed(() => props.path.split("*"));

const methodClass = computed(() => {
  switch (props.method) {
    case "GET":
      return "text-emerald-600 dark:text-emerald-400";
    case "POST":
      return "text-amber-600 dark:text-amber-400";
    case "PUT":
    case "PATCH":
      return "text-sky-600 dark:text-sky-400";
    case "DELETE":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-surface-500 dark:text-surface-400";
  }
});
</script>

<template>
  <button
    type="button"
    role="option"
    :aria-selected="active"
    :tabindex="active ? 0 : -1"
    class="flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 px-3 text-left text-[13px] outline-none transition-colors focus-visible:bg-surface-100 dark:focus-visible:bg-surface-800"
    :class="
      active
        ? 'bg-surface-100 text-surface-950 dark:bg-surface-800 dark:text-surface-0'
        : 'text-surface-700 hover:bg-surface-50 dark:text-surface-200 dark:hover:bg-surface-800/40'
    "
    @click="$emit('select')"
  >
    <span
      class="min-w-0 flex-1 truncate font-mono"
      :class="error !== undefined ? 'text-red-600 dark:text-red-400' : ''"
      :title="error === undefined ? path : `${path} (${error})`"
    >
      <template v-if="path.trim() === ''">{{ error }}</template>
      <template v-else>
        <template v-for="(segment, index) in segments" :key="index">
          <span v-if="index > 0" class="text-sky-600 dark:text-sky-400">*</span
          >{{ segment }}
        </template>
      </template>
    </span>
    <span
      v-if="method"
      class="shrink-0 font-mono text-[10px] font-semibold"
      :class="methodClass"
      >{{ method }}</span
    >
    <span
      class="w-7 shrink-0 text-right font-mono text-[11px] text-surface-500 dark:text-surface-400"
      >{{ status ?? "" }}</span
    >
  </button>
</template>
