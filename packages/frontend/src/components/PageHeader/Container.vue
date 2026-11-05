<script setup lang="ts">
import Divider from "primevue/divider";
import { useMediaQuery } from "@vueuse/core";

defineProps<{
  title: string;
  subtitle: string;
}>();

const isDesktopViewport = useMediaQuery("(min-width: 640px)");
</script>

<template>
  <div class="mx-auto w-full max-w-7xl px-3 pt-4 pb-2 sm:px-6 sm:pt-8">
    <div class="mb-2">
      <div class="flex items-center gap-3">
        <h1
          class="text-2xl font-bold text-surface-900 dark:text-surface-0 sm:text-4xl"
        >
          {{ title }}
        </h1>
        <slot name="title" />
      </div>
      <p class="text-sm text-surface-400 sm:text-base">
        {{ subtitle }}
      </p>
    </div>
    <slot />
  </div>
  <Divider v-if="isDesktopViewport" class="mb-6" />
</template>
