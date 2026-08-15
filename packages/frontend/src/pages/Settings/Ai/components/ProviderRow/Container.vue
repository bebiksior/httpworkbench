<script setup lang="ts">
import type { Component } from "vue";

defineProps<{
  icon: Component;
  name: string;
}>();
</script>

<template>
  <div
    class="flex flex-col gap-3 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
  >
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <component
        :is="icon"
        class="h-5 w-5 shrink-0 text-surface-900 dark:text-surface-0"
      />
      <div class="min-w-0">
        <p class="text-sm font-medium text-surface-900 dark:text-surface-0">
          {{ name }}
        </p>
        <div
          v-if="$slots.detail"
          class="mt-0.5 text-xs text-surface-500 dark:text-surface-400"
        >
          <slot name="detail" />
        </div>
      </div>
    </div>

    <slot name="actions" />
  </div>
</template>
