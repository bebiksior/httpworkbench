<script setup lang="ts">
import Tag from "primevue/tag";

defineProps<{
  icon: string;
  accentClass: string;
  name: string;
  description: string;
  statusLabel: string;
  statusSeverity: "success" | "secondary";
  linkUrl: string;
  linkLabel: string;
}>();
</script>

<template>
  <div
    class="rounded-lg border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-800 sm:p-5"
  >
    <div class="flex items-start gap-3">
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        :class="accentClass"
      >
        <i :class="icon" />
      </span>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4
            class="text-base font-semibold text-surface-900 dark:text-surface-0"
          >
            {{ name }}
          </h4>
          <Tag :value="statusLabel" :severity="statusSeverity" />
        </div>

        <p class="mt-1 text-sm text-surface-600 dark:text-surface-300">
          {{ description }}
        </p>

        <slot />

        <a
          :href="linkUrl"
          target="_blank"
          rel="noreferrer"
          class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-surface-600 transition-colors hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-0"
        >
          {{ linkLabel }}
          <i class="pi pi-external-link text-[0.625rem]" />
        </a>
      </div>
    </div>
  </div>
</template>
