<script setup lang="ts">
import Button from "primevue/button";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { useElementSize, useMediaQuery, useResizeObserver } from "@vueuse/core";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { CardSkeleton } from "@/components/CardSkeleton";
import { EmptyCard } from "@/components/EmptyCard";
import { PageHeader } from "@/components/PageHeader";
import { config } from "@/config";
import { useAuthStore } from "@/stores/auth";
import { InstanceItem } from "./InstanceItem";
import { Pager } from "./Pager";
import { useHomeLogic } from "./useLogic";
import { usePagination } from "./usePagination";

const {
  searchQuery,
  filteredInstances,
  instances,
  isLoading,
  handleCreateInstance,
  isCreating,
  canDeleteAll,
  handleDeleteAll,
  isDeletingAll,
  error,
  handleRetry,
} = useHomeLogic();

const hasSearchQuery = computed(() => searchQuery.value.trim() !== "");

const instanceCount = computed(() => instances.value?.length ?? 0);
const instanceLimit = computed(() => config.maxInstancesPerOwner);
const showInstanceLimit = computed(
  () => config.isHosted === true && instanceLimit.value !== undefined,
);

const countText = computed(() => {
  const total = `${instanceCount.value.toLocaleString()} ${instanceCount.value === 1 ? "instance" : "instances"}`;
  if (isLoading.value) return "Loading instances…";
  if (!hasSearchQuery.value) return total;
  return `${filteredInstances.value.length.toLocaleString()} of ${total}`;
});

const authStore = useAuthStore();
const { isGuest } = storeToRefs(authStore);
const isDesktopViewport = useMediaQuery("(min-width: 640px)");

const listRef = ref<HTMLElement | null>(null);
const cardsRef = ref<HTMLElement | null>(null);
const { height: listHeight } = useElementSize(listRef);
const cardHeight = ref(0);
// Read from the list, not a ref on the first card: paging swaps that card out and would reset it.
useResizeObserver(cardsRef, () => {
  const height =
    cardsRef.value?.firstElementChild?.getBoundingClientRect().height;
  if (height !== undefined && height > 0) cardHeight.value = height;
});
const cardGap = computed(() => (isDesktopViewport.value ? 16 : 12));
const pageSize = computed(() => {
  const card = cardHeight.value || (isDesktopViewport.value ? 100 : 116);
  return Math.floor(
    (listHeight.value + cardGap.value) / (card + cardGap.value),
  );
});

const { page, pageCount, pageSlice, rangeText, goTo } = usePagination({
  items: filteredInstances,
  pageSize,
  isReady: () =>
    !isLoading.value && instances.value !== undefined && listHeight.value > 0,
  resetOn: searchQuery,
});
const showPager = computed(() => !isLoading.value && pageCount.value > 1);
</script>

<template>
  <div
    class="flex h-full flex-col overflow-y-auto bg-surface-50 dark:bg-surface-900"
  >
    <PageHeader title="Instances" :subtitle="countText">
      <template #title>
        <Skeleton
          v-if="isLoading && showInstanceLimit"
          width="3.75rem"
          height="1.25rem"
          border-radius="0.375rem"
        />
        <span
          v-else-if="showInstanceLimit"
          class="text-base font-medium text-surface-400 sm:text-lg"
        >
          {{ instanceCount }}/{{ instanceLimit }}
        </span>
      </template>
      <Message v-if="isGuest" severity="info" :closable="false" class="mt-4">
        You are in the Guest mode. Some features are limited.
      </Message>
    </PageHeader>

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
            placeholder="Search instances..."
            class="w-full"
          />
        </IconField>
        <div class="flex flex-wrap items-center gap-2">
          <div
            v-if="showPager"
            class="flex w-full items-center gap-2 sm:mr-2 sm:w-auto"
          >
            <span class="mr-auto text-sm text-surface-400 tabular-nums sm:mr-1">
              {{ rangeText }}
            </span>
            <Button
              icon="pi pi-chevron-left"
              severity="secondary"
              outlined
              :disabled="page <= 1"
              aria-label="Previous page"
              @click="goTo(page - 1)"
            />
            <Button
              icon="pi pi-chevron-right"
              severity="secondary"
              outlined
              :disabled="page >= pageCount"
              aria-label="Next page"
              @click="goTo(page + 1)"
            />
          </div>
          <Button
            label="Delete All"
            icon="pi pi-trash"
            severity="danger"
            outlined
            :loading="isDeletingAll"
            :disabled="!canDeleteAll"
            class="flex-1 sm:flex-none"
            @click="handleDeleteAll"
          />
          <Button
            label="Create Instance"
            icon="pi pi-plus"
            :loading="isCreating"
            class="flex-1 sm:flex-none"
            @click="handleCreateInstance"
          />
        </div>
      </div>

      <Message
        v-if="error"
        severity="error"
        :closable="false"
        class="mb-6 flex items-center justify-between gap-4"
      >
        <span class="flex-1">{{
          error?.message ?? "Unable to load instances"
        }}</span>
        <Button
          label="Retry"
          size="small"
          text
          severity="contrast"
          @click="handleRetry"
        />
      </Message>

      <div
        v-if="isLoading"
        class="min-h-0 flex-1 space-y-3 overflow-hidden sm:space-y-4"
        aria-label="Loading instances"
        aria-busy="true"
      >
        <CardSkeleton v-for="index in 3" :key="index" :actions="3" />
      </div>

      <template v-else-if="filteredInstances.length > 0">
        <div ref="listRef" class="min-h-0 flex-1 overflow-hidden">
          <ul
            ref="cardsRef"
            class="space-y-3 sm:space-y-4"
            aria-label="Instances"
          >
            <li v-for="instance in pageSlice" :key="instance.id">
              <InstanceItem :instance="instance" />
            </li>
          </ul>
        </div>
        <div
          v-if="showPager"
          class="mt-4 flex items-center justify-center text-sm text-surface-400 sm:justify-between"
        >
          <span class="hidden tabular-nums sm:inline">{{ rangeText }}</span>
          <Pager :page="page" :page-count="pageCount" @update:page="goTo" />
        </div>
      </template>
      <EmptyCard
        v-else
        :title="hasSearchQuery ? 'No instances found' : 'No instances yet'"
        :description="
          hasSearchQuery
            ? 'Try adjusting your search query'
            : 'Create your first instance to get started'
        "
      />
    </div>
  </div>
</template>
