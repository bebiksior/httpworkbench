<script setup lang="ts">
import Skeleton from "primevue/skeleton";

defineProps<{ actions: number }>();
</script>

<template>
  <article
    class="rounded-lg border border-surface-200 bg-white p-3 dark:border-surface-700 dark:bg-surface-800 sm:p-5"
    aria-hidden="true"
  >
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <div class="min-w-0 shrink-0">
        <div class="mb-1 flex h-6 items-center sm:h-7">
          <div class="h-5 w-44 sm:h-6">
            <Skeleton width="100%" height="100%" border-radius="0.375rem" />
          </div>
        </div>
        <div class="flex h-4 items-center gap-4 sm:h-5">
          <div class="h-3 w-[10.875rem] sm:h-3.5 sm:w-[11.875rem]">
            <Skeleton width="100%" height="100%" />
          </div>
          <div class="h-3 w-10 sm:h-3.5 sm:w-11">
            <Skeleton width="100%" height="100%" />
          </div>
        </div>
      </div>
      <div class="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:gap-2">
        <div class="h-10 min-w-0 flex-1 sm:w-80 sm:flex-none">
          <Skeleton width="100%" height="100%" border-radius="0.375rem" />
        </div>
        <div
          v-for="action in actions"
          :key="action"
          class="h-[2.1875rem] w-8 shrink-0"
        >
          <Skeleton width="100%" height="100%" border-radius="0.375rem" />
        </div>
      </div>
    </div>
  </article>
</template>
