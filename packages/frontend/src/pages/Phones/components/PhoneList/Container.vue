<script setup lang="ts">
import Skeleton from "primevue/skeleton";
import type { Phone } from "shared";
import { formatPhoneNumber } from "../../phone";

defineProps<{
  phones: Phone[];
  selectedId?: string;
  isLoading: boolean;
}>();

const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="isLoading" class="space-y-px" aria-busy="true">
      <div v-for="index in 2" :key="index" class="px-4 py-3.5">
        <Skeleton width="55%" height="0.8rem" class="mb-2" />
        <Skeleton width="70%" height="0.7rem" />
      </div>
    </div>

    <div
      v-else-if="phones.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-1 px-6 pb-10 text-center"
    >
      <p class="text-sm font-medium text-surface-700 dark:text-surface-200">
        No numbers
      </p>
      <p class="text-sm text-surface-500 dark:text-surface-400">
        Rent a number from your provider and it shows up here.
      </p>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <ul aria-label="Phones">
        <li v-for="phone in phones" :key="phone.id">
          <button
            type="button"
            class="block w-full border-b border-surface-100 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary dark:border-surface-700/60"
            :class="
              phone.id === selectedId
                ? 'bg-surface-100 dark:bg-surface-700/60'
                : 'hover:bg-surface-50 dark:hover:bg-surface-700/30'
            "
            :aria-current="phone.id === selectedId ? 'true' : undefined"
            @click="emit('select', phone.id)"
          >
            <span class="flex items-center justify-between gap-3">
              <span
                class="truncate font-mono text-sm font-medium text-surface-900 dark:text-surface-0"
              >
                {{ formatPhoneNumber(phone.number) }}
              </span>
              <i
                v-if="!phone.alwaysOn"
                class="pi pi-moon shrink-0 text-xs text-surface-400"
                aria-label="Needs a wake before it receives SMS"
                v-tooltip.left="'Needs a wake before it receives SMS'"
              />
            </span>
            <span
              class="mt-0.5 block truncate text-xs"
              :class="
                phone.notes
                  ? 'text-surface-600 dark:text-surface-300'
                  : 'text-surface-400'
              "
            >
              {{ phone.notes ?? "No notes" }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
