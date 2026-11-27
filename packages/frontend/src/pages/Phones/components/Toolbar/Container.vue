<script setup lang="ts">
import { useClipboard, useTimestamp } from "@vueuse/core";
import Button from "primevue/button";
import type { Phone, PhoneWake } from "shared";
import { computed } from "vue";
import { formatPhoneNumber, formatWakeWindow } from "../../phone";

const props = defineProps<{
  phone?: Phone;
  phoneCount: number;
  wake?: PhoneWake;
  isWaking: boolean;
}>();

const emit = defineEmits<{
  back: [];
  wake: [];
  editNotes: [];
}>();

const { copy, copied } = useClipboard({ copiedDuring: 1200, legacy: true });
const now = useTimestamp({ interval: 1_000 });
const wakeWindow = computed(() =>
  props.wake ? formatWakeWindow(props.wake, now.value) : undefined,
);
const copyNumber = () => {
  if (props.phone !== undefined) {
    void copy(props.phone.number);
  }
};
</script>

<template>
  <header
    class="flex h-16 shrink-0 items-center gap-2 border-b border-surface-200 bg-white px-2 sm:gap-3 sm:px-4 dark:border-surface-700 dark:bg-surface-800"
  >
    <Button
      v-if="phone"
      icon="pi pi-arrow-left"
      severity="secondary"
      text
      rounded
      class="shrink-0 lg:hidden"
      aria-label="Back"
      @click="emit('back')"
    />
    <div v-if="phone" class="min-w-0 flex-1 pl-2 lg:pl-0">
      <button
        type="button"
        class="group/number flex max-w-full items-center gap-1.5 rounded font-mono text-[15px] leading-tight font-semibold text-surface-900 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary dark:text-surface-0"
        :title="`Copy ${phone.number}`"
        @click="copyNumber"
      >
        <span class="truncate select-text">{{
          formatPhoneNumber(phone.number)
        }}</span>
        <i
          class="pi text-[10px] text-surface-500 transition-opacity duration-150 group-hover/number:opacity-100"
          :class="copied ? 'pi-check opacity-100' : 'pi-copy opacity-0'"
          aria-hidden="true"
        />
      </button>
      <p class="truncate text-xs text-surface-500 dark:text-surface-400">
        {{ phone.notes ?? "No notes" }}
      </p>
    </div>
    <div v-else class="min-w-0 flex-1 pl-2">
      <p
        class="text-[15px] leading-tight font-semibold text-surface-900 dark:text-surface-0"
      >
        Phones
      </p>
      <p class="text-xs text-surface-500 dark:text-surface-400">
        {{ phoneCount }} {{ phoneCount === 1 ? "number" : "numbers" }}
      </p>
    </div>
    <span
      v-if="phone && wakeWindow"
      class="hidden shrink-0 text-xs text-surface-400 tabular-nums md:inline"
    >
      {{ wakeWindow }}
    </span>
    <Button
      v-if="phone && !phone.alwaysOn"
      label="Wake"
      icon="pi pi-sun"
      size="small"
      class="shrink-0"
      :loading="isWaking"
      :pt="{ label: { class: 'hidden sm:inline' } }"
      aria-label="Wake line"
      v-tooltip.bottom="'Bring the line online to receive SMS'"
      @click="emit('wake')"
    />
    <Button
      v-if="phone"
      icon="pi pi-pencil"
      severity="secondary"
      text
      rounded
      aria-label="Edit notes"
      v-tooltip.bottom="'Edit notes'"
      @click="emit('editNotes')"
    />
  </header>
</template>
