<script setup lang="ts">
import { computed } from "vue";
import { useAiSettings } from "@/utils/ai";
import { ChatContent } from "./ChatContent";
import { ChatInput } from "./ChatInput";
import SetupRequired from "./SetupRequired.vue";

const { isEnabled, hasConfiguredProvider } = useAiSettings();
const isAvailable = computed(
  () => isEnabled.value && hasConfiguredProvider.value,
);
const setupReason = computed(() =>
  isEnabled.value ? "not-configured" : "disabled",
);
</script>

<template>
  <div class="flex flex-col h-full w-full bg-surface-50 dark:bg-surface-900">
    <div v-if="isAvailable" class="flex-1 min-h-0 relative">
      <ChatContent class="absolute inset-0" />
    </div>
    <SetupRequired v-else :reason="setupReason" />
    <ChatInput v-if="isAvailable" />
  </div>
</template>
