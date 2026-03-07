<script setup lang="ts">
import Button from "primevue/button";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ModelSelector } from "./ModelSelector";
import { useChat } from "./useChat";

const {
  abortMessage,
  inputMessage,
  isEditingMessage,
  isAgentIdle,
  canSendMessage,
  handleSend,
  handleKeydown,
} = useChat();

const textareaRef = ref<HTMLTextAreaElement>();
const composerRef = ref<HTMLElement>();
const composerHeight = ref<number | null>(null);

const MOBILE_COMPOSER_HEIGHT = 140;
const DESKTOP_COMPOSER_HEIGHT = 208;
const MAX_COMPOSER_VIEWPORT_RATIO = 0.6;

let resizeState:
  | {
      startY: number;
      startHeight: number;
    }
  | undefined;

const getMinComposerHeight = () => {
  return window.matchMedia("(min-width: 640px)").matches
    ? DESKTOP_COMPOSER_HEIGHT
    : MOBILE_COMPOSER_HEIGHT;
};

const clampComposerHeight = (height: number) => {
  const minHeight = getMinComposerHeight();
  const maxHeight = Math.max(
    minHeight,
    Math.floor(window.innerHeight * MAX_COMPOSER_VIEWPORT_RATIO),
  );
  return Math.min(maxHeight, Math.max(minHeight, Math.round(height)));
};

const syncComposerHeight = () => {
  const fallbackHeight = composerRef.value?.offsetHeight ?? getMinComposerHeight();
  const nextHeight = composerHeight.value ?? fallbackHeight;
  composerHeight.value = clampComposerHeight(nextHeight);
};

const stopResize = () => {
  resizeState = undefined;
  document.body.style.removeProperty("cursor");
  document.body.style.removeProperty("user-select");
  window.removeEventListener("pointermove", handleResizePointerMove);
  window.removeEventListener("pointerup", stopResize);
  window.removeEventListener("pointercancel", stopResize);
};

const handleResizePointerMove = (event: PointerEvent) => {
  if (resizeState === undefined) {
    return;
  }

  composerHeight.value = clampComposerHeight(
    resizeState.startHeight + (resizeState.startY - event.clientY),
  );
};

const handleResizePointerDown = (event: PointerEvent) => {
  const currentHeight =
    composerHeight.value ?? composerRef.value?.offsetHeight ?? getMinComposerHeight();

  resizeState = {
    startY: event.clientY,
    startHeight: currentHeight,
  };

  document.body.style.cursor = "row-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", handleResizePointerMove);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
  event.preventDefault();
};

const composerStyle = computed(() => {
  if (composerHeight.value === null) {
    return undefined;
  }

  return { height: `${composerHeight.value}px` };
});

const focusTextarea = () => {
  textareaRef.value?.focus();
};

onMounted(() => {
  focusTextarea();
  syncComposerHeight();
  window.addEventListener("resize", syncComposerHeight);
});

onBeforeUnmount(() => {
  stopResize();
  window.removeEventListener("resize", syncComposerHeight);
});

watch(
  isEditingMessage,
  (isEditing) => {
    if (isEditing && textareaRef.value) {
      focusTextarea();
    }
  },
  { flush: "post" },
);
</script>

<template>
  <div
    ref="composerRef"
    :style="composerStyle"
    class="bg-surface-100 dark:bg-surface-900 relative h-35 sm:h-52 flex flex-col gap-4 border-t border-surface-300 dark:border-surface-700 p-4"
  >
    <div
      class="absolute inset-x-0 top-0 h-3 -translate-y-1/2 cursor-row-resize touch-none"
      @pointerdown="handleResizePointerDown"
    />
    <textarea
      ref="textareaRef"
      v-model="inputMessage"
      placeholder="Message the Assistant"
      :class="{
        'opacity-60': !isAgentIdle,
        'text-surface-700 dark:text-surface-200': isAgentIdle,
        'text-surface-500 dark:text-surface-400': !isAgentIdle,
      }"
      class="border-0 outline-none font-mono resize-none bg-transparent flex-1 text-base focus:outline-none focus:ring-0 overflow-y-auto scrollbar-hide"
      style="scrollbar-width: none; -ms-overflow-style: none"
      spellcheck="false"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      @keydown="handleKeydown"
    />
    <div class="flex gap-2 items-center min-w-0">
      <div class="flex gap-2 shrink-0">
        <ModelSelector @request-focus-input="focusTextarea" />
      </div>
      <div class="flex items-center gap-2 min-w-0 flex-1 justify-end">
        <Button
          v-if="isAgentIdle"
          severity="tertiary"
          size="small"
          icon="pi pi-arrow-up"
          :disabled="!canSendMessage"
          :pt="{
            root: {
              class: canSendMessage
                ? 'bg-surface-700/50 text-surface-200 text-sm py-1.5 px-2 flex items-center justify-center rounded-md hover:text-white transition-colors duration-200 h-8 w-8 cursor-pointer shrink-0'
                : 'bg-surface-700/20 text-surface-400 text-sm py-1.5 px-2 flex items-center justify-center rounded-md h-8 w-8 cursor-not-allowed shrink-0',
            },
          }"
          @click="handleSend"
        />
        <Button
          v-else
          severity="danger"
          icon="pi pi-stop"
          size="small"
          :pt="{
            root: {
              class:
                'bg-red-400/10 text-red-400 py-1 px-1.5 flex items-center justify-center rounded-md hover:bg-red-400/20 transition-colors duration-200 h-8 w-8 cursor-pointer shrink-0',
            },
            icon: {
              class: 'text-sm',
            },
          }"
          @click="abortMessage"
        />
      </div>
    </div>
  </div>
</template>
