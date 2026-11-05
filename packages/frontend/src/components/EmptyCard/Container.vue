<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <div
    class="flex h-51 flex-col items-center justify-center rounded-lg border border-surface-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-800"
  >
    <h3 class="text-lg font-medium text-surface-700 dark:text-surface-300">
      {{ title }}
    </h3>
    <p class="text-surface-400">{{ description }}</p>
  </div>
</template>
