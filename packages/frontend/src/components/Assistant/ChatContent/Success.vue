<script setup lang="ts">
import { ref } from "vue";
import { ChatMessage } from "../ChatMessage";
import { useAutoScroll } from "../useAutoScroll";
import { useContent } from "./useContent";

const { messages, agentStatus } = useContent();
const scrollContainer = ref<HTMLElement | undefined>();

useAutoScroll(scrollContainer, [messages, agentStatus]);
</script>

<template>
  <div ref="scrollContainer" class="h-full overflow-y-auto px-2 pb-2 space-y-2">
    <ChatMessage
      v-for="message in messages"
      :key="message.id"
      :message="message"
    />
  </div>
</template>
