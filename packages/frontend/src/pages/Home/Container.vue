<script setup lang="ts">
import Button from "primevue/button";
import Divider from "primevue/divider";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { useElementSize, useMediaQuery } from "@vueuse/core";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { config } from "@/config";
import { useAuthStore } from "@/stores/auth";
import { EmptyState } from "./Empty";
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
const firstCardRef = ref<HTMLElement | null>(null);
const { height: listHeight } = useElementSize(listRef);
const { height: cardHeight } = useElementSize(firstCardRef, undefined, {
  box: "border-box",
});
const cardGap = computed(() => (isDesktopViewport.value ? 16 : 12));
const pageSize = computed(() => {
  const card = cardHeight.value || (isDesktopViewport.value ? 100 : 116);
  return Math.floor(
    (listHeight.value + cardGap.value) / (card + cardGap.value),
  );
});
const setFirstCard = (index: number) => (el: unknown) => {
  if (index === 0) firstCardRef.value = el instanceof HTMLElement ? el : null;
};

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
    <div class="mx-auto w-full max-w-7xl px-3 pt-4 pb-2 sm:px-6 sm:pt-8">
      <div
        class="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div>
          <div class="flex items-center gap-3">
            <h1
              class="text-2xl font-bold text-surface-900 dark:text-surface-0 sm:text-4xl"
            >
              Instances
            </h1>
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
          </div>
          <p class="text-sm text-surface-400 sm:text-base">
            {{ countText }}
          </p>
        </div>
      </div>
      <Message v-if="isGuest" severity="info" :closable="false" class="mt-4">
        You are in the Guest mode. Some features are limited.
      </Message>
    </div>

    <Divider v-if="isDesktopViewport" class="mb-6" />

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
        <article
          v-for="index in 3"
          :key="index"
          class="rounded-lg border border-surface-200 bg-white p-3 dark:border-surface-700 dark:bg-surface-800 sm:p-5"
          aria-hidden="true"
        >
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <div class="min-w-0 shrink-0">
              <div class="mb-1 flex h-6 items-center sm:h-7">
                <div class="h-5 w-44 sm:h-6">
                  <Skeleton
                    width="100%"
                    height="100%"
                    border-radius="0.375rem"
                  />
                </div>
              </div>
              <div class="flex h-4 items-center gap-4 sm:h-5">
                <div class="h-3 w-[10.875rem] sm:h-3.5 sm:w-[11.875rem]">
                  <Skeleton width="100%" height="100%" />
                </div>
                <div class="h-3 w-10 sm:h-3.5 sm:w-11">
                  <Skeleton width="100%" height="100%" />
                </div>
              </div>
            </div>
            <div
              class="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:gap-2"
            >
              <div class="h-10 min-w-0 flex-1 sm:w-80 sm:flex-none">
                <Skeleton width="100%" height="100%" border-radius="0.375rem" />
              </div>
              <div
                v-for="action in 3"
                :key="action"
                class="h-[2.1875rem] w-8 shrink-0"
              >
                <Skeleton width="100%" height="100%" border-radius="0.375rem" />
              </div>
            </div>
          </div>
        </article>
      </div>

      <template v-else-if="filteredInstances.length > 0">
        <div ref="listRef" class="min-h-0 flex-1 overflow-hidden">
          <ul class="space-y-3 sm:space-y-4" aria-label="Instances">
            <li
              v-for="(instance, index) in pageSlice"
              :key="instance.id"
              :ref="setFirstCard(index)"
            >
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
      <EmptyState v-else :has-search-query="hasSearchQuery" />
    </div>
  </div>
</template>
