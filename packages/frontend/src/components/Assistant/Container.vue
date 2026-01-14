<script setup lang="ts">
import { ChatContent } from "./ChatContent";
import { ChatInput } from "./ChatInput";
</script>

<template>
  <div class="flex flex-col h-full w-full bg-surface-50 dark:bg-surface-900">
    <div class="flex-1 min-h-0 relative">
      <ChatContent class="absolute inset-0" />
    </div>
    <ChatInput />
  </div>
</template>
