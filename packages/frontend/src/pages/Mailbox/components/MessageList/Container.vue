<script setup lang="ts">
import Button from "primevue/button";
import Skeleton from "primevue/skeleton";
import { TextShimmer } from "@/components/TextShimmer";
import type { MailFolder, MailMessageSummary } from "shared";
import { computed } from "vue";
import { useNotify } from "@/composables";
import { correspondentLabel, formatMailTime } from "../../mail";

const props = defineProps<{
  messages: MailMessageSummary[];
  folder: MailFolder;
  selectedId?: string;
  address: string;
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  prefetch: [id: string];
  "update:folder": [folder: MailFolder];
  loadMore: [];
}>();

const notify = useNotify();
const host = computed(() => props.address.split("@")[1] ?? "");

const copyAddress = async () => {
  await navigator.clipboard.writeText(props.address);
  notify.copied();
};

const folders: { id: MailFolder; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
];
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      class="flex shrink-0 gap-1 border-b border-surface-200 p-2 dark:border-surface-700"
      role="tablist"
      aria-label="Folders"
    >
      <button
        v-for="entry in folders"
        :key="entry.id"
        type="button"
        role="tab"
        :aria-selected="folder === entry.id"
        class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary"
        :class="
          folder === entry.id
            ? 'bg-surface-100 text-surface-900 dark:bg-surface-700 dark:text-surface-0'
            : 'text-surface-500 hover:bg-surface-50 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700/40 dark:hover:text-surface-0'
        "
        @click="emit('update:folder', entry.id)"
      >
        {{ entry.label }}
        <span
          v-if="entry.id === 'inbox' && unreadCount > 0"
          class="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums text-primary-contrast"
        >
          {{ unreadCount }}
        </span>
      </button>
    </div>

    <div v-if="isLoading" class="space-y-px" aria-busy="true">
      <div v-for="index in 4" :key="index" class="px-4 py-3.5">
        <Skeleton width="45%" height="0.8rem" class="mb-2" />
        <Skeleton width="80%" height="0.8rem" class="mb-1.5" />
        <Skeleton width="65%" height="0.7rem" />
      </div>
    </div>

    <div
      v-else-if="messages.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-10 text-center"
    >
      <template v-if="folder === 'inbox'">
        <p class="text-sm font-medium">
          <TextShimmer :duration="1.6">Waiting for mail</TextShimmer>
        </p>
        <button
          type="button"
          class="inline-flex max-w-full items-center rounded-md px-2 py-1 font-mono text-xs break-all text-surface-500 transition-colors duration-150 hover:bg-surface-100 hover:text-surface-900 focus-visible:outline-2 focus-visible:outline-primary dark:text-surface-400 dark:hover:bg-surface-700/50 dark:hover:text-surface-0"
          :title="`Copy ${address}`"
          @click="copyAddress"
        >
          *@{{ host }}
        </button>
      </template>
      <p v-else class="text-sm text-surface-500 dark:text-surface-400">
        Nothing sent yet
      </p>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <ul aria-label="Messages">
        <li v-for="message in messages" :key="message.id">
          <button
            type="button"
            class="relative block w-full border-b border-surface-100 py-3 pr-4 pl-6 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary dark:border-surface-700/60"
            :class="
              message.id === selectedId
                ? 'bg-surface-100 dark:bg-surface-700/60'
                : 'hover:bg-surface-50 dark:hover:bg-surface-700/30'
            "
            :aria-current="message.id === selectedId ? 'true' : undefined"
            @pointerenter="emit('prefetch', message.id)"
            @focus="emit('prefetch', message.id)"
            @click="emit('select', message.id)"
          >
            <span
              v-if="!message.read"
              class="absolute top-[1.2rem] left-2.5 size-1.5 rounded-full bg-sky-500"
              aria-label="Unread"
            />
            <span class="flex items-baseline justify-between gap-3">
              <span
                class="truncate text-sm"
                :class="
                  message.read
                    ? 'text-surface-700 dark:text-surface-200'
                    : 'font-semibold text-surface-900 dark:text-surface-0'
                "
              >
                {{ correspondentLabel(message) }}
              </span>
              <span class="shrink-0 text-xs tabular-nums text-surface-400">
                {{ formatMailTime(message.timestamp) }}
              </span>
            </span>
            <span class="mt-0.5 flex items-center gap-1.5">
              <span
                class="truncate text-sm"
                :class="
                  message.read
                    ? 'text-surface-600 dark:text-surface-300'
                    : 'font-medium text-surface-900 dark:text-surface-50'
                "
              >
                {{ message.subject || "(no subject)" }}
              </span>
              <i
                v-if="message.attachmentCount > 0"
                class="pi pi-paperclip shrink-0 text-[11px] text-surface-400"
                aria-label="Has attachments"
              />
            </span>
            <span
              v-if="message.preview"
              class="mt-0.5 block truncate text-xs text-surface-500 dark:text-surface-400"
            >
              {{ message.preview }}
            </span>
          </button>
        </li>
      </ul>
      <div v-if="hasMore" class="flex justify-center p-3">
        <Button
          label="Load older"
          severity="secondary"
          text
          size="small"
          :loading="isLoadingMore"
          @click="emit('loadMore')"
        />
      </div>
    </div>
  </div>
</template>
