<script setup lang="ts">
import { computed } from "vue";
import { pageItems } from "../pagination";

const props = defineProps<{ page: number; pageCount: number }>();
const emit = defineEmits<{ "update:page": [page: number] }>();

const items = computed(() => pageItems(props.page, props.pageCount));

const idleClass =
  "text-surface-500 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-0";
const stepClass = `flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${idleClass}`;
</script>

<template>
  <nav
    class="flex items-center gap-0.5 text-[13px] tabular-nums"
    aria-label="Pagination"
  >
    <button
      type="button"
      :class="stepClass"
      :disabled="page <= 1"
      aria-label="Previous page"
      @click="emit('update:page', page - 1)"
    >
      <i class="pi pi-chevron-left text-[10px]" aria-hidden="true" />
    </button>
    <template v-for="(item, index) in items" :key="index">
      <span
        v-if="item === 'gap'"
        class="w-6 text-center text-surface-400"
        aria-hidden="true"
      >
        …
      </span>
      <button
        v-else
        type="button"
        class="h-7 min-w-7 cursor-pointer rounded-md px-1.5 transition-colors"
        :class="
          item === page
            ? 'bg-surface-200 font-medium text-surface-950 dark:bg-surface-700 dark:text-surface-0'
            : idleClass
        "
        :aria-label="`Page ${item}`"
        :aria-current="item === page ? 'page' : undefined"
        @click="emit('update:page', item)"
      >
        {{ item }}
      </button>
    </template>
    <button
      type="button"
      :class="stepClass"
      :disabled="page >= pageCount"
      aria-label="Next page"
      @click="emit('update:page', page + 1)"
    >
      <i class="pi pi-chevron-right text-[10px]" aria-hidden="true" />
    </button>
  </nav>
</template>
