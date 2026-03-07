<script setup lang="ts">
import { useHasOpenrouterKey } from "@/utils/openrouter";
import { ChatContent } from "./ChatContent";
import { ChatInput } from "./ChatInput";
import SetupRequired from "./SetupRequired.vue";

const hasOpenrouterKey = useHasOpenrouterKey();
</script>

<template>
  <div class="flex flex-col h-full w-full bg-surface-50 dark:bg-surface-900">
    <div v-if="hasOpenrouterKey" class="flex-1 min-h-0 relative">
      <ChatContent class="absolute inset-0" />
    </div>
    <SetupRequired v-else />
    <ChatInput v-if="hasOpenrouterKey" />
  </div>
</template>
