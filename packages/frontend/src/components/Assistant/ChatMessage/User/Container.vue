<script setup lang="ts">
import { toRefs } from "vue";
import { useUserMessage } from "./useMessage";
import { type CustomUIMessage } from "@/agent/types";

const props = defineProps<{
  message: CustomUIMessage & { role: "user" };
}>();

const { message } = toRefs(props);

const { isGenerating, handleMessageClick } = useUserMessage();
</script>

<template>
  <div
    class="p-3 rounded-lg bg-surface-900 ml-auto shadow-md shadow-surface-900/50 w-full select-text group relative border border-surface-700 hover:border-secondary-400 transition-colors max-h-[300px] min-h-[45px] overflow-y-scroll"
    style="scrollbar-width: none; -ms-overflow-style: none"
  >
    <div
      v-for="(part, index) in message.parts"
      :key="index"
      class="text-surface-700 dark:text-surface-200 whitespace-pre-wrap wrap-break-word font-mono text-sm cursor-pointer rounded p-1 -m-1"
      :class="{ 'opacity-80': isGenerating }"
      @click="handleMessageClick(message)"
    >
      <span v-if="part && part.type === 'text'">{{ part?.text ?? "" }}</span>
    </div>
  </div>
</template>

<style scoped>
div::-webkit-scrollbar {
  display: none;
}
</style>
