<script setup lang="ts">
import { useVirtualizer } from "@tanstack/vue-virtual";
import Button from "primevue/button";
import Divider from "primevue/divider";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { useMediaQuery, useResizeObserver } from "@vueuse/core";
import { computed, nextTick, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { config } from "@/config";
import { useAuthStore } from "@/stores/auth";
import { EmptyState } from "./Empty";
import { InstanceItem } from "./InstanceItem";
import { useHomeLogic } from "./useLogic";

const {
  searchQuery,
  filteredInstances,
  instances,
  isLoading,
  handleCreateInstance,
  isCreating,
  error,
  handleRetry,
} = useHomeLogic();

const hasSearchQuery = computed(() => searchQuery.value.trim() !== "");

const instanceCount = computed(() => instances.value?.length ?? 0);
const instanceLimit = computed(() => config.maxInstancesPerOwner);
const showInstanceLimit = computed(
  () => config.isHosted === true && instanceLimit.value !== undefined,
);

const authStore = useAuthStore();
const { isGuest } = storeToRefs(authStore);
const isDesktopViewport = useMediaQuery("(min-width: 640px)");

const scrollerRef = ref<HTMLElement | null>(null);
const instancesListRef = ref<HTMLElement | null>(null);
const listScrollMargin = ref(0);
const instanceKeys = computed(() =>
  filteredInstances.value.map((instance) => instance.id),
);

const instanceVirtualizer = useVirtualizer(
  computed(() => ({
    count: instanceKeys.value.length,
    getScrollElement: () => scrollerRef.value,
    estimateSize: () => (isDesktopViewport.value ? 100 : 116),
    overscan: 8,
    scrollMargin: listScrollMargin.value,
    getItemKey: (index: number) => instanceKeys.value[index] ?? index,
  })),
);

const virtualInstances = computed(() =>
  instanceVirtualizer.value.getVirtualItems(),
);
const virtualInstancesHeight = computed(
  () => instanceVirtualizer.value.getTotalSize() + 32,
);

const updateListScrollMargin = () => {
  const scroller = scrollerRef.value;
  const list = instancesListRef.value;
  if (scroller === null || list === null) {
    return;
  }

  listScrollMargin.value =
    list.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop;
};

const measureInstance = (element: unknown) => {
  if (element instanceof Element) {
    instanceVirtualizer.value.measureElement(element);
  }
};

useResizeObserver(scrollerRef, updateListScrollMargin);
useResizeObserver(instancesListRef, updateListScrollMargin);

watch(
  [instancesListRef, instanceKeys, isDesktopViewport],
  async () => {
    await nextTick();
    updateListScrollMargin();
    instanceVirtualizer.value.measure();
  },
  { flush: "post" },
);
</script>

<template>
  <div
    ref="scrollerRef"
    class="h-full overflow-y-auto bg-surface-50 dark:bg-surface-900"
  >
    <div class="mx-auto max-w-7xl px-3 pt-4 pb-2 sm:px-6 sm:pt-8">
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
            All owned instances
          </p>
        </div>
      </div>
      <Message v-if="isGuest" severity="info" :closable="false" class="mt-4">
        You are in the Guest mode. Some features are limited.
      </Message>
    </div>

    <Divider v-if="isDesktopViewport" class="mb-6" />

    <div class="mx-auto max-w-7xl px-3 pt-4 sm:px-6 sm:pt-2">
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
        <Button
          label="Create Instance"
          icon="pi pi-plus"
          :loading="isCreating"
          class="w-full sm:w-auto"
          @click="handleCreateInstance"
        />
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
        class="space-y-3 pb-8 sm:space-y-4"
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

      <div
        v-else-if="filteredInstances.length > 0"
        ref="instancesListRef"
        class="relative w-full"
        :style="{ height: `${virtualInstancesHeight}px` }"
        role="list"
        aria-label="Instances"
      >
        <div
          v-for="virtualInstance in virtualInstances"
          :key="String(virtualInstance.key)"
          :ref="measureInstance"
          :data-index="virtualInstance.index"
          class="absolute left-0 top-0 w-full pb-3 sm:pb-4"
          :style="{
            transform: `translateY(${virtualInstance.start - listScrollMargin}px)`,
          }"
          role="listitem"
        >
          <InstanceItem :instance="filteredInstances[virtualInstance.index]" />
        </div>
      </div>
      <EmptyState v-else :has-search-query="hasSearchQuery" />
    </div>
  </div>
</template>
