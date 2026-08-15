<script setup lang="ts">
import InputText from "primevue/inputtext";
import Skeleton from "primevue/skeleton";
import type { Instance } from "shared";
import { computed } from "vue";
import { config } from "@/config";
import { isPresent } from "@/utils/types";

const props = defineProps<{
  instance?: Instance;
}>();

const displayName = computed(() => {
  const instance = props.instance;
  if (instance === undefined) {
    return undefined;
  }
  if (isPresent(instance.label) && instance.label !== "") {
    return instance.label;
  }
  return `Instance ${instance.id}`;
});

const formattedDate = computed(() => {
  if (props.instance === undefined) {
    return undefined;
  }
  return new Date(props.instance.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
});

const instanceHost = computed(() =>
  props.instance === undefined
    ? undefined
    : config.getInstanceHost(props.instance.id),
);
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col gap-5 p-3 sm:gap-8 sm:p-4"
    aria-label="Loading instance details"
    aria-busy="true"
  >
    <div class="flex flex-col gap-5 sm:gap-6">
      <div>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h2
              v-if="displayName"
              class="truncate text-xl font-bold text-surface-900 dark:text-surface-0 sm:text-2xl"
            >
              {{ displayName }}
            </h2>
            <Skeleton v-else width="12rem" height="1.75rem" />
          </div>
          <Skeleton shape="circle" size="2rem" class="shrink-0" />
        </div>
        <span
          v-if="formattedDate"
          class="text-sm text-surface-600 dark:text-surface-400"
        >
          {{ formattedDate }}
        </span>
        <Skeleton v-else class="mt-1" width="8rem" height="0.875rem" />
      </div>

      <div class="flex flex-col gap-2">
        <span
          class="text-sm font-medium text-surface-700 dark:text-surface-300"
        >
          Hostname
        </span>
        <InputText
          v-if="instanceHost"
          :value="instanceHost"
          readonly
          size="small"
          aria-label="Interaction host"
          class="min-w-0 w-full bg-surface-50 font-mono text-sm dark:bg-surface-800"
        />
        <Skeleton v-else width="100%" height="2.25rem" />
        <p class="text-xs text-surface-600 dark:text-surface-400">
          Send HTTP, HTTPS, DNS, and SMTP requests to this host to see them
          appear in the logs.
        </p>
      </div>
    </div>

    <div class="flex min-h-[260px] flex-1 flex-col gap-3 lg:min-h-0">
      <div>
        <h3 class="font-semibold text-surface-900 dark:text-surface-0">
          Raw Response
        </h3>
        <p class="mt-1 text-xs text-surface-600 dark:text-surface-400">
          Customize the raw HTTP response returned by this instance.
        </p>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <Skeleton v-for="action in 3" :key="action" height="2rem" />
      </div>
      <Skeleton class="min-h-52 flex-1" width="100%" height="100%" />
    </div>

    <div class="mt-auto grid grid-cols-3 gap-2">
      <Skeleton v-for="action in 3" :key="action" height="2rem" />
    </div>
  </div>
</template>
