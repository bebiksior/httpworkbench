<script setup lang="ts">
import Button from "primevue/button";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { computed, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import { CardSkeleton } from "@/components/CardSkeleton";
import { EmptyCard } from "@/components/EmptyCard";
import { PageHeader } from "@/components/PageHeader";
import {
  PagerFooter,
  PagerSteps,
  usePagination,
} from "@/components/Pagination";
import { useNotify } from "@/composables";
import { useCreateMailbox, useMailboxes } from "@/queries/domains/useMailboxes";
import { MailboxItem } from "./MailboxItem";

const router = useRouter();
const notify = useNotify();
const { data: mailboxes, isLoading, error, refetch } = useMailboxes();
const createMutation = useCreateMailbox();
const searchQuery = ref("");

const hasSearchQuery = computed(() => searchQuery.value.trim() !== "");

const filtered = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const list = mailboxes.value ?? [];
  return query === ""
    ? list
    : list.filter((mailbox) =>
        [mailbox.address, mailbox.label ?? ""].some((value) =>
          value.toLowerCase().includes(query),
        ),
      );
});

const countText = computed(() => {
  if (isLoading.value) return "Loading mailboxes…";
  const total = mailboxes.value?.length ?? 0;
  const totalText = `${total.toLocaleString()} ${total === 1 ? "mailbox" : "mailboxes"}`;
  if (!hasSearchQuery.value) return totalText;
  return `${filtered.value.length.toLocaleString()} of ${totalText}`;
});

const { page, pageCount, pageSlice, rangeText, showPager, goTo } =
  usePagination({
    list: useTemplateRef<HTMLElement>("list"),
    cards: useTemplateRef<HTMLElement>("cards"),
    items: filtered,
    isReady: () => !isLoading.value && mailboxes.value !== undefined,
    resetOn: searchQuery,
  });

const createMailbox = () => {
  createMutation.mutate(undefined, {
    onSuccess: (mailbox) => router.push(`/mail/${mailbox.id}`),
    onError: (err) => notify.error("Failed to create mailbox", err),
  });
};
</script>

<template>
  <div
    class="flex h-full flex-col overflow-y-auto bg-surface-50 dark:bg-surface-900"
  >
    <PageHeader title="Mail" :subtitle="countText" />

    <div
      class="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 pt-4 pb-6 sm:px-6 sm:pt-2"
    >
      <div
        class="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <IconField class="w-full sm:max-w-md">
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="searchQuery"
            placeholder="Search mailboxes..."
            class="w-full"
          />
        </IconField>
        <div class="flex flex-wrap items-center gap-2">
          <PagerSteps
            v-if="showPager"
            :page="page"
            :page-count="pageCount"
            :range-text="rangeText"
            @update:page="goTo"
          />
          <Button
            label="Create Mailbox"
            icon="pi pi-plus"
            :loading="createMutation.isPending.value"
            class="flex-1 sm:flex-none"
            @click="createMailbox"
          />
        </div>
      </div>

      <Message
        v-if="error"
        severity="error"
        :closable="false"
        class="mb-6 flex items-center justify-between gap-4"
      >
        <span class="flex-1">{{ error.message }}</span>
        <Button
          label="Retry"
          size="small"
          text
          severity="contrast"
          @click="refetch()"
        />
      </Message>

      <div
        v-if="isLoading"
        class="min-h-0 flex-1 space-y-3 overflow-hidden sm:space-y-4"
        aria-label="Loading mailboxes"
        aria-busy="true"
      >
        <CardSkeleton v-for="index in 3" :key="index" :actions="2" />
      </div>
      <template v-else-if="filtered.length > 0">
        <div ref="list" class="min-h-0 flex-1 overflow-hidden">
          <ul ref="cards" class="space-y-3 sm:space-y-4" aria-label="Mailboxes">
            <li v-for="mailbox in pageSlice" :key="mailbox.id">
              <MailboxItem :mailbox="mailbox" />
            </li>
          </ul>
        </div>
        <PagerFooter
          v-if="showPager"
          :page="page"
          :page-count="pageCount"
          :range-text="rangeText"
          @update:page="goTo"
        />
      </template>
      <EmptyCard
        v-else
        :title="hasSearchQuery ? 'No mailboxes found' : 'No mailboxes yet'"
        :description="
          hasSearchQuery
            ? 'Try adjusting your search query'
            : 'Create your first mailbox to get started'
        "
      />
    </div>
  </div>
</template>
