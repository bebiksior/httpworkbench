<script setup lang="ts">
import { toRefs } from "vue";
import TextShimmer from "@/components/Assistant/TextShimmer.vue";
import { useToolMessage } from "./useMessage";
import type { MessageState } from "@/agent/types";

const props = defineProps<{
  toolName: string;
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-error"
    | "output-denied";
  output: unknown;
  messageState: MessageState | undefined;
}>();

const { toolName, state, output, messageState } = toRefs(props);

const { isProcessing, formatToolCall } = useToolMessage({
  toolName,
  state,
  output,
  messageState,
});
</script>

<template>
  <div class="py-1">
    <div class="flex items-center text-surface-500 dark:text-surface-400 text-sm font-mono">
      <TextShimmer v-if="isProcessing">{{ formatToolCall }}</TextShimmer>
      <span v-else>{{ formatToolCall }}</span>
    </div>
  </div>
</template>
