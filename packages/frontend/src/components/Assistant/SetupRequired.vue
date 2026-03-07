<script setup lang="ts">
import Button from "primevue/button";
import { useRouter } from "vue-router";

const router = useRouter();

const openSettings = () => {
  void router.push({ name: "settings" });
};
</script>

<template>
  <div class="flex h-full items-center justify-center px-6">
    <div class="max-w-sm text-center flex flex-col items-center gap-4">
      <div
        class="h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center"
      >
        <i class="pi pi-key text-xl" />
      </div>
      <div class="space-y-2">
        <h3 class="text-lg font-semibold text-surface-700 dark:text-surface-200">
          OpenRouter key required
        </h3>
        <p class="text-sm text-surface-500 dark:text-surface-400">
          Add your OpenRouter API key in Settings to enable the assistant and
          send messages.
        </p>
      </div>
      <Button
        label="Open settings"
        icon="pi pi-cog"
        size="small"
        @click="openSettings"
      />
    </div>
  </div>
</template>
