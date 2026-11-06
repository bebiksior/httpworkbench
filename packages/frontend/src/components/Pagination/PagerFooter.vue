<script setup lang="ts">
import Pager from "./Pager.vue";

defineProps<{ page: number; pageCount: number; rangeText: string }>();
const emit = defineEmits<{ "update:page": [page: number] }>();
</script>

<template>
  <div
    class="mt-4 flex items-center justify-center text-sm text-surface-400 sm:justify-between"
  >
    <span class="hidden tabular-nums sm:inline">{{ rangeText }}</span>
    <Pager
      :page="page"
      :page-count="pageCount"
      @update:page="emit('update:page', $event)"
    />
  </div>
</template>
