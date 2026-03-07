<script setup lang="ts">
import { onClickOutside, useEventListener } from "@vueuse/core";
import { ref, useId, watch } from "vue";
import { useSelector } from "./useSelector";

const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  requestFocusInput: [];
}>();

const { models, modelId, selectedModel } = useSelector();
const rootRef = ref<HTMLElement>();
const isOpen = ref(false);
const popoverId = useId();

const closePopover = (focusInput = false) => {
  if (!isOpen.value) return;

  isOpen.value = false;

  if (focusInput) {
    emit("requestFocusInput");
  }
};

const togglePopover = () => {
  if (props.disabled === true) return;

  if (isOpen.value) {
    closePopover(true);
    return;
  }

  isOpen.value = true;
};

const handleSelect = (nextModelId: string) => {
  modelId.value = nextModelId;
  closePopover(true);
};

onClickOutside(rootRef, () => {
  closePopover(false);
});

useEventListener(window, "keydown", (event) => {
  if (event.key !== "Escape" || !isOpen.value) return;

  event.preventDefault();
  closePopover(true);
});

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      closePopover(false);
    }
  },
);
</script>

<template>
  <div ref="rootRef" class="relative shrink-0">
    <button
      type="button"
      :disabled="disabled === true"
      :aria-expanded="isOpen"
      :aria-controls="popoverId"
      class="flex min-w-0 items-center gap-2 rounded-md border border-surface-700/70 bg-surface-900/70 px-3 py-1.5 text-sm text-surface-300 transition-colors duration-200"
      :class="[
        disabled === true
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:border-surface-500 hover:text-surface-100',
        isOpen ? 'border-surface-500 text-surface-100' : '',
      ]"
      @click="togglePopover"
    >
      <component
        :is="selectedModel?.icon ?? undefined"
        v-if="selectedModel?.icon !== undefined"
        class="h-4 w-4 shrink-0"
      />
      <div v-else class="h-3 w-3 shrink-0 rounded-sm bg-surface-500" />
      <span class="max-w-44 truncate font-mono">
        {{ selectedModel?.name ?? "Select model" }}
      </span>
      <i
        class="pi pi-chevron-down text-[10px] text-surface-500 transition-transform duration-200"
        :class="isOpen ? 'rotate-180' : ''"
      />
    </button>

    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="translate-y-1 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-1 opacity-0"
    >
      <div
        v-if="isOpen"
        :id="popoverId"
        class="absolute bottom-full left-0 z-[1202] mb-2 w-72 max-w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-surface-700/80 bg-surface-950/95 shadow-2xl shadow-black/30 backdrop-blur"
      >
        <div class="border-b border-surface-800 px-3 py-2">
          <p class="text-[11px] font-medium uppercase tracking-[0.18em] text-surface-500">
            Models
          </p>
        </div>
        <div class="max-h-72 overflow-y-auto p-1.5">
          <button
            v-for="model in models"
            :key="model.id"
            type="button"
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150"
            :class="
              model.id === modelId
                ? 'bg-surface-800 text-surface-50'
                : 'text-surface-300 hover:bg-surface-900 hover:text-surface-50'
            "
            @click="handleSelect(model.id)"
          >
            <component
              :is="model.icon ?? undefined"
              v-if="model.icon !== undefined"
              class="h-4 w-4 shrink-0"
            />
            <div v-else class="h-3 w-3 shrink-0 rounded-sm bg-surface-500" />
            <span class="min-w-0 flex-1 truncate font-mono text-sm">
              {{ model.name }}
            </span>
            <i
              v-if="model.id === modelId"
              class="pi pi-check text-xs text-surface-400"
            />
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
