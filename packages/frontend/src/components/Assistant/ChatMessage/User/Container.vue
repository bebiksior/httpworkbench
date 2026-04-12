<script setup lang="ts">
import { computed, ref, toRefs } from "vue";
import { useUserMessage } from "./useMessage";
import { type CustomUIMessage } from "@/agent/types";
import { Confirmation } from "@/components/Confirmation";

const props = defineProps<{
  message: CustomUIMessage & { role: "user" };
}>();

const { message } = toRefs(props);

const { isGenerating, hasSnapshot, handleMessageClick, revertToSnapshot } =
  useUserMessage();

const canRevert = computed(
  () => hasSnapshot(message.value.id) && !isGenerating.value,
);
const showRevertDialog = ref(false);

const handleRevert = () => {
  if (!canRevert.value) {
    return;
  }
  showRevertDialog.value = true;
};

const handleRevertConfirm = () => {
  revertToSnapshot(message.value.id);
};
</script>

<template>
  <div
    class="p-3 rounded-lg bg-surface-100 dark:bg-surface-900 ml-auto shadow-md shadow-surface-300/50 dark:shadow-surface-900/50 w-full select-text group relative border border-surface-300 dark:border-surface-700 hover:border-secondary-400 transition-colors duration-100 max-h-64 overflow-y-auto"
  >
    <button
      v-if="canRevert"
      type="button"
      class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-200 dark:hover:bg-surface-800 transition-all duration-150 rounded"
      title="Revert to this point"
      @click.stop="handleRevert"
    >
      <i class="pi pi-undo text-xs" />
    </button>
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
  <Confirmation
    v-model:visible="showRevertDialog"
    title="Restore Editor State"
    message="This will restore the editor to its state when this message was sent. All subsequent chat messages will be removed."
    @confirm="handleRevertConfirm"
  />
</template>
