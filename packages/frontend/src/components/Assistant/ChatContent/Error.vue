<script setup lang="ts">
import { useContent } from "./useContent";
import { useAgentsStore } from "@/stores";

const { error } = useContent();
const agentsStore = useAgentsStore();

const restart = () => {
  agentsStore.agent?.clearError();
};
</script>

<template>
  <div
    class="flex flex-col items-center justify-center h-full text-center px-4 gap-4"
  >
    <i class="pi pi-exclamation-triangle text-red-500 text-2xl"></i>
    <h3 class="text-lg font-semibold text-surface-200">Error Occurred</h3>
    <span class="text-surface-400 text-sm whitespace-pre-wrap select-text">
      {{ error }}
    </span>
    <button
      class="px-4 py-2 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-lg text-sm"
      @click="restart"
    >
      Clear Error
    </button>
  </div>
</template>
