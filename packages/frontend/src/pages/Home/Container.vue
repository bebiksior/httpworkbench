<script setup lang="ts">
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import Divider from "primevue/divider";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { useMediaQuery } from "@vueuse/core";
import { computed } from "vue";
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
const showDesktopDivider = useMediaQuery("(min-width: 640px)");
</script>

<template>
  <ConfirmDialog />
  <div class="h-full overflow-y-auto bg-surface-50 dark:bg-surface-900">
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
            <span
              v-if="showInstanceLimit"
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

    <Divider v-if="showDesktopDivider" class="mb-6" />

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

      <div v-if="isLoading" class="flex justify-center py-16">
        <i class="pi pi-spinner pi-spin text-4xl text-surface-400" />
      </div>

      <div
        v-else-if="filteredInstances.length > 0"
        class="space-y-3 pb-8 sm:space-y-4"
      >
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
