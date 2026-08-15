<script setup lang="ts">
import { onClickOutside, useEventListener } from "@vueuse/core";
import { computed, nextTick, ref, useId, watch } from "vue";
import type { SelectMenuOption } from "./types";

const props = defineProps<{
  modelValue: string;
  options: SelectMenuOption[];
  label: string;
  menuClass?: string;
  mono?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  selected: [];
}>();

const rootRef = ref<HTMLElement>();
const triggerRef = ref<HTMLButtonElement>();
const menuRef = ref<HTMLElement>();
const isOpen = ref(false);
const menuId = useId();

const isDisabled = computed(
  () => props.disabled === true || props.options.length === 0,
);

const selectedOption = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
);

const triggerLabel = computed(() =>
  selectedOption.value === undefined
    ? props.label
    : `${props.label}: ${selectedOption.value.label}`,
);

const getItems = () =>
  Array.from(
    menuRef.value?.querySelectorAll<HTMLButtonElement>(
      "[role='menuitemradio']",
    ) ?? [],
  );

const focusItem = (index: number) => {
  const items = getItems();
  if (items.length === 0) return;

  items[((index % items.length) + items.length) % items.length]?.focus();
};

const openMenu = async (target: "selected" | "first" | "last") => {
  if (isDisabled.value || isOpen.value) return;

  isOpen.value = true;
  await nextTick();

  if (target === "first") {
    focusItem(0);
    return;
  }

  if (target === "last") {
    focusItem(getItems().length - 1);
    return;
  }

  const selectedIndex = props.options.findIndex(
    (option) => option.value === props.modelValue,
  );
  focusItem(selectedIndex === -1 ? 0 : selectedIndex);
};

const closeMenu = (restoreFocus: boolean) => {
  if (!isOpen.value) return;

  isOpen.value = false;

  if (restoreFocus) {
    triggerRef.value?.focus();
  }
};

const toggleMenu = () => {
  if (isOpen.value) {
    closeMenu(true);
    return;
  }

  void openMenu("selected");
};

const handleSelect = (value: string) => {
  emit("update:modelValue", value);
  closeMenu(false);
  emit("selected");
};

const handleMenuKeydown = (event: KeyboardEvent) => {
  const items = getItems();
  const currentIndex = items.indexOf(
    document.activeElement as HTMLButtonElement,
  );

  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusItem(currentIndex + 1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusItem(currentIndex - 1);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    focusItem(0);
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    focusItem(items.length - 1);
    return;
  }

  if (event.key === "Tab") {
    closeMenu(false);
  }
};

onClickOutside(rootRef, () => {
  closeMenu(false);
});

useEventListener(window, "keydown", (event) => {
  if (event.key !== "Escape" || !isOpen.value) return;

  event.preventDefault();
  event.stopPropagation();
  closeMenu(true);
});

watch(isDisabled, (disabled) => {
  if (disabled) {
    closeMenu(false);
  }
});
</script>

<template>
  <div ref="rootRef" class="relative min-w-0">
    <button
      ref="triggerRef"
      type="button"
      :disabled="isDisabled"
      :aria-expanded="isOpen"
      :aria-controls="menuId"
      :aria-label="triggerLabel"
      aria-haspopup="menu"
      class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-500"
      :class="[
        isDisabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:bg-surface-800/70 hover:text-surface-100',
        isOpen ? 'bg-surface-800/70' : '',
      ]"
      @click="toggleMenu"
      @keydown.down.prevent="openMenu('first')"
      @keydown.up.prevent="openMenu('last')"
    >
      <slot name="trigger" />
      <i
        class="pi pi-chevron-down shrink-0 text-[9px] text-surface-500 transition-transform duration-200"
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
        :id="menuId"
        ref="menuRef"
        role="menu"
        :aria-label="label"
        class="absolute bottom-full left-0 z-[1202] mb-2 max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-surface-700/80 bg-surface-950/95 p-1 shadow-2xl shadow-black/30 backdrop-blur"
        :class="menuClass ?? 'w-56'"
        @keydown="handleMenuKeydown"
      >
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          role="menuitemradio"
          :aria-checked="option.value === modelValue"
          class="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-500"
          :class="
            option.value === modelValue
              ? 'bg-surface-800 text-surface-50'
              : 'text-surface-300 hover:bg-surface-900 hover:text-surface-50'
          "
          @click="handleSelect(option.value)"
        >
          <component
            :is="option.icon"
            v-if="option.icon !== undefined"
            class="h-4 w-4 shrink-0 text-surface-0"
          />
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-sm"
              :class="mono === true ? 'font-mono' : ''"
            >
              {{ option.label }}
            </span>
            <span
              v-if="option.description !== undefined"
              class="block truncate text-[11px] text-surface-500"
            >
              {{ option.description }}
            </span>
          </span>
          <i
            class="pi pi-check shrink-0 text-xs text-surface-400"
            :class="option.value === modelValue ? '' : 'invisible'"
          />
        </button>
      </div>
    </transition>
  </div>
</template>
