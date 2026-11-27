<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import Button from "primevue/button";
import Skeleton from "primevue/skeleton";
import dayjs from "dayjs";
import type { Phone } from "shared";
import { ref } from "vue";
import { TextShimmer } from "@/components/TextShimmer";
import { usePhoneSms } from "@/queries/domains/usePhones";
import { formatMailTime } from "../../../Mailbox/mail";
import { formatPhoneNumber } from "../../phone";

const props = defineProps<{ phone: Phone }>();

const { data, isLoading, error, refetch } = usePhoneSms(() => props.phone.id);

const { copy, copied } = useClipboard({ copiedDuring: 1200, legacy: true });
const copiedId = ref<string>();

const copyValue = (id: string, value: string) => {
  copiedId.value = id;
  void copy(value);
};

const isCopied = (id: string) => copied.value && copiedId.value === id;
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-white dark:bg-surface-800">
    <div
      v-if="error"
      class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-surface-500"
    >
      {{ error.message }}
      <Button
        label="Retry"
        severity="secondary"
        text
        size="small"
        @click="refetch()"
      />
    </div>

    <div v-else-if="isLoading" class="space-y-px" aria-busy="true">
      <div v-for="index in 3" :key="index" class="px-4 py-4 sm:px-6">
        <Skeleton width="30%" height="0.8rem" class="mb-2" />
        <Skeleton width="85%" height="0.8rem" />
      </div>
    </div>

    <div
      v-else-if="(data?.messages.length ?? 0) === 0"
      class="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-10 text-center"
    >
      <p class="text-sm font-medium">
        <TextShimmer :duration="1.6">Waiting for SMS</TextShimmer>
      </p>
      <button
        type="button"
        class="inline-flex max-w-full items-center rounded-md px-2 py-1 font-mono text-xs text-surface-500 transition-colors duration-150 hover:bg-surface-100 hover:text-surface-900 focus-visible:outline-2 focus-visible:outline-primary dark:text-surface-400 dark:hover:bg-surface-700/50 dark:hover:text-surface-0"
        :title="`Copy ${phone.number}`"
        @click="copyValue('number', phone.number)"
      >
        {{ formatPhoneNumber(phone.number) }}
        <i
          class="pi ml-1.5 text-[10px]"
          :class="isCopied('number') ? 'pi-check' : 'pi-copy opacity-60'"
          aria-hidden="true"
        />
      </button>
      <p
        v-if="!phone.alwaysOn"
        class="text-xs text-surface-500 dark:text-surface-400"
      >
        Wake the line before requesting a code.
      </p>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <ul aria-label="SMS">
        <li
          v-for="sms in data?.messages"
          :key="sms.id"
          class="border-b border-surface-100 px-4 py-3 sm:px-6 dark:border-surface-700/60"
        >
          <div class="flex items-baseline justify-between gap-3">
            <span
              class="truncate text-sm font-medium text-surface-900 dark:text-surface-0"
            >
              {{ sms.from ?? "Unknown sender" }}
            </span>
            <span
              class="shrink-0 text-xs tabular-nums text-surface-400"
              :title="dayjs(sms.timestamp).format('MMM D, YYYY HH:mm:ss')"
            >
              {{ formatMailTime(sms.timestamp) }}
            </span>
          </div>
          <div class="mt-1 flex items-start justify-between gap-3">
            <p
              class="min-w-0 text-sm break-words whitespace-pre-wrap text-surface-700 select-text dark:text-surface-200"
            >
              {{ sms.text || "(empty)" }}
            </p>
            <button
              v-if="sms.parsedCode"
              type="button"
              class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-surface-200 px-2 py-1 font-mono text-sm font-semibold text-surface-900 transition-colors duration-150 hover:border-surface-400 hover:bg-surface-50 focus-visible:outline-2 focus-visible:outline-primary dark:border-surface-700 dark:text-surface-0 dark:hover:border-surface-500 dark:hover:bg-surface-700/40"
              :aria-label="isCopied(sms.id) ? 'Copied' : 'Copy code'"
              v-tooltip.left="'Copy code'"
              @click="copyValue(sms.id, sms.parsedCode)"
            >
              {{ sms.parsedCode }}
              <i
                class="pi text-[11px] text-surface-400"
                :class="isCopied(sms.id) ? 'pi-check' : 'pi-copy'"
                aria-hidden="true"
              />
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
