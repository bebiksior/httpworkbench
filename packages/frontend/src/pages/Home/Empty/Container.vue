<script setup lang="ts">
import { toRefs } from "vue";

const props = defineProps<{
  hasSearchQuery: boolean;
}>();

const { hasSearchQuery } = toRefs(props);
</script>

<template>
  <div
    class="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg p-5 flex flex-col items-center justify-center h-51"
  >
    <h3 class="text-lg font-medium text-surface-700 dark:text-surface-300">
      {{ hasSearchQuery ? "No instances found" : "No instances yet" }}
    </h3>
    <p class="text-surface-400">
      {{
        hasSearchQuery
          ? "Try adjusting your search query"
          : "Create your first instance to get started"
      }}
    </p>
  </div>
</template>
