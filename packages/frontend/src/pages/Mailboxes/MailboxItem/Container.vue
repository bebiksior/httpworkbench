<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import type { MailboxSummary } from "shared";
import { computed } from "vue";
import { useNotify } from "@/composables";
import { useDeleteMailbox } from "@/queries/domains/useMailboxes";

const props = defineProps<{ mailbox: MailboxSummary }>();

const notify = useNotify();
const deleteMutation = useDeleteMailbox();

const displayName = computed(
  () => props.mailbox.label ?? `Mailbox ${props.mailbox.id}`,
);

const formattedDate = computed(() =>
  new Date(props.mailbox.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }),
);

const copyAddress = async () => {
  await navigator.clipboard.writeText(props.mailbox.address);
  notify.copied();
};

const deleteMailbox = () => {
  deleteMutation.mutate(props.mailbox.id, {
    onSuccess: () => notify.success("Mailbox deleted"),
    onError: (err) => notify.error("Failed to delete mailbox", err),
  });
};
</script>

<template>
  <article
    class="relative select-none rounded-lg border border-surface-200 bg-white p-3 transition-colors hover:border-primary sm:p-5 dark:border-surface-700 dark:bg-surface-800"
  >
    <RouterLink
      :to="`/mail/${mailbox.id}`"
      draggable="false"
      class="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-label="`Open ${displayName}`"
    />
    <div
      class="pointer-events-none relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <div class="min-w-0 shrink-0">
        <div class="mb-1 flex items-center gap-2">
          <h2
            class="min-w-0 truncate text-base font-semibold text-surface-900 dark:text-surface-0 sm:text-lg"
          >
            {{ displayName }}
          </h2>
          <span
            v-if="mailbox.unreadCount > 0"
            class="min-w-6 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-primary-contrast"
            :aria-label="`${mailbox.unreadCount} unread`"
          >
            {{ mailbox.unreadCount }}
          </span>
        </div>
        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm"
        >
          <span>
            <span class="text-surface-400">Created</span>
            <span
              class="ml-1 text-[11px] text-surface-600 dark:text-surface-200 sm:text-xs"
            >
              {{ formattedDate }}
            </span>
          </span>
          <span>
            <span class="text-surface-400">Messages</span>
            <span
              class="ml-1 text-[11px] text-surface-600 dark:text-surface-200 sm:text-xs"
            >
              {{ mailbox.messageCount.toLocaleString() }}
            </span>
          </span>
        </div>
      </div>

      <div
        class="pointer-events-auto relative z-10 flex min-w-0 items-center gap-1.5 sm:gap-2"
      >
        <InputText
          :value="mailbox.address"
          readonly
          :aria-label="`Address of ${displayName}`"
          class="min-w-0 flex-1 select-text font-mono text-xs sm:w-80 sm:text-sm"
        />
        <Button
          icon="pi pi-copy"
          severity="secondary"
          outlined
          size="small"
          class="shrink-0"
          aria-label="Copy address"
          v-tooltip.top="'Copy address'"
          @click="copyAddress"
        />
        <Button
          :icon="
            deleteMutation.isPending.value
              ? 'pi pi-spin pi-spinner'
              : 'pi pi-trash'
          "
          severity="danger"
          outlined
          size="small"
          class="shrink-0"
          aria-label="Delete mailbox"
          v-tooltip.top="'Delete mailbox'"
          :disabled="deleteMutation.isPending.value"
          @click="deleteMailbox"
        />
      </div>
    </div>
  </article>
</template>
