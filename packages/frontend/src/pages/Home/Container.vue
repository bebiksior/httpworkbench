<script setup lang="ts">
import Button from "primevue/button";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { computed, useTemplateRef } from "vue";
import { storeToRefs } from "pinia";
import { CardSkeleton } from "@/components/CardSkeleton";
import { EmptyCard } from "@/components/EmptyCard";
import { PageHeader } from "@/components/PageHeader";
import {
  PagerFooter,
  PagerSteps,
  usePagination,
} from "@/components/Pagination";
import { config } from "@/config";
import { useAuthStore } from "@/stores/auth";
import { InstanceItem } from "./InstanceItem";
import { useHomeLogic } from "./useLogic";

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

const { page, pageCount, pageSlice, rangeText, showPager, goTo } =
  usePagination({
    list: useTemplateRef<HTMLElement>("list"),
    cards: useTemplateRef<HTMLElement>("cards"),
    items: filteredInstances,
    isReady: () => !isLoading.value && instances.value !== undefined,
    resetOn: searchQuery,
  });
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
          <PagerSteps
            v-if="showPager"
            :page="page"
            :page-count="pageCount"
            :range-text="rangeText"
            @update:page="goTo"
          />
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
        <div ref="list" class="min-h-0 flex-1 overflow-hidden">
          <ul ref="cards" class="space-y-3 sm:space-y-4" aria-label="Instances">
            <li v-for="instance in pageSlice" :key="instance.id">
              <InstanceItem :instance="instance" />
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
