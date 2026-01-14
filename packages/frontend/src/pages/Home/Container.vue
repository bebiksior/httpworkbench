<script setup lang="ts">
import Button from "primevue/button";
import Divider from "primevue/divider";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore, useConfigStore } from "@/stores";
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

const configStore = useConfigStore();
const instanceCount = computed(() => instances.value?.length ?? 0);
const instanceLimit = computed(() => configStore.config?.maxInstancesPerOwner);
const showInstanceLimit = computed(
  () =>
    configStore.config?.isHosted === true && instanceLimit.value !== undefined,
);

const authStore = useAuthStore();
const { isGuest } = storeToRefs(authStore);
</script>

<template>
  <div class="h-full overflow-y-auto bg-surface-50 dark:bg-surface-900">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 pt-6 sm:pt-8 pb-2">
      <div
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-2"
      >
        <div>
          <div class="flex items-center gap-3">
            <h1
              class="text-2xl sm:text-4xl font-bold text-surface-900 dark:text-surface-0"
            >
              Instances
            </h1>
            <span
              v-if="showInstanceLimit"
              class="text-base sm:text-lg text-surface-400 font-medium"
            >
              {{ instanceCount }}/{{ instanceLimit }}
            </span>
          </div>
          <p class="text-sm sm:text-base text-surface-400">
            All owned instances
          </p>
        </div>
        <Button
          label="Settings"
          icon="pi pi-cog"
          outlined
          :disabled="isGuest"
          class="w-full sm:w-auto"
          @click="$router.push('/settings')"
        />
      </div>
      <Message v-if="isGuest" severity="info" :closable="false" class="mt-4">
        You are in the Guest mode. Some features are limited.
      </Message>
    </div>

    <Divider class="mb-6" />

    <div class="mx-auto max-w-7xl px-4 sm:px-6 pt-2">
      <div
        class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
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

      <div v-if="isLoading" class="flex justify-center py-16">
        <i class="pi pi-spinner pi-spin text-4xl text-surface-400" />
      </div>

      <div v-else-if="filteredInstances.length > 0" class="space-y-4 pb-8">
        <InstanceItem
          v-for="instance in filteredInstances"
          :key="instance.id"
          :instance="instance"
        />
      </div>
      <EmptyState v-else :has-search-query="hasSearchQuery" />
    </div>
  </div>
</template>
