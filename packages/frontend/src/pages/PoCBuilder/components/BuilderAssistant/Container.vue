<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import { Assistant } from "@/components/Assistant";
import { useAuthStore, useBuilderStore } from "@/stores";

const authStore = useAuthStore();
const { isGuest } = storeToRefs(authStore);
const builderStore = useBuilderStore();
</script>

<template>
  <div class="relative h-full min-h-0 py-2">
    <Button
      icon="pi pi-times"
      severity="secondary"
      text
      size="small"
      class="absolute! top-1.5 right-1.5 z-20 p-0! w-6! h-6! text-xs! opacity-60 hover:opacity-100"
      aria-label="Hide assistant"
      aria-keyshortcuts="Meta+I Control+I"
      @click="builderStore.showAssistant = false"
      v-tooltip.left="'Hide assistant (⌘I)'"
    />
    <div
      v-if="isGuest"
      class="flex h-full items-center justify-center px-4 text-center text-sm text-surface-500"
    >
      Assistant is not available in guest mode.
    </div>
    <Assistant v-else />
  </div>
</template>
