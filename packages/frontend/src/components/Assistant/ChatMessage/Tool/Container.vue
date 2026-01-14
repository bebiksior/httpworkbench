<script setup lang="ts">
import { toRefs } from "vue";
import { useToolMessage } from "./useMessage";
import type { MessageState } from "@/agent/types";

const props = defineProps<{
  toolName: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  output: unknown;
  messageState: MessageState | undefined;
}>();

const { toolName, state, output, messageState } = toRefs(props);

const { isProcessing, toolIcon, toolDetails, showDetails, toggleDetails } =
  useToolMessage({ toolName, state, output, messageState });
</script>

<template>
  <div
    class="my-2 border border-surface-200 dark:border-surface-800 rounded-lg overflow-hidden bg-surface-100 dark:bg-surface-900/30 w-full max-w-full"
  >
    <!-- Header -->
    <div
      class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800/50 transition-colors select-none"
      @click="toggleDetails"
    >
      <!-- Icon -->
      <div
        class="flex items-center justify-center w-6 h-6 rounded bg-surface-200 dark:bg-surface-800 text-surface-600 dark:text-surface-300 shrink-0"
        :class="{ 'animate-pulse': isProcessing }"
      >
        <i :class="toolIcon" class="text-xs" />
      </div>

      <!-- Tool Name & Status -->
      <div class="flex flex-col flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span
            class="text-sm font-medium text-surface-200 truncate font-mono"
            >{{ toolName }}</span
          >
          <span
            class="text-xs text-surface-500 whitespace-nowrap font-mono uppercase tracking-wider"
          >
            {{
              isProcessing
                ? "Running"
                : state === "output-error"
                  ? "Failed"
                  : "Success"
            }}
          </span>
        </div>
      </div>

      <!-- Chevron -->
      <i
        v-if="toolDetails"
        class="pi text-xs text-surface-500 transition-transform duration-200 shrink-0"
        :class="showDetails ? 'pi-chevron-up' : 'pi-chevron-down'"
      />
    </div>

    <!-- Details (Expanded) -->
    <div
      v-if="showDetails && toolDetails"
      class="border-t border-surface-800 bg-surface-950/30 p-3 overflow-hidden"
    >
      <pre
        class="text-xs text-surface-300 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-[300px] scrollbar-thin"
        >{{ toolDetails }}</pre
      >
    </div>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: var(--surface-700);
  border-radius: 3px;
}
</style>
