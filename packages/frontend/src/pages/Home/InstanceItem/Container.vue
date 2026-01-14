<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import type { Instance } from "shared";
import { computed, toRefs } from "vue";
import { useRouter } from "vue-router";
import { useNotify } from "@/composables";
import { config } from "@/config";
import { useDeleteInstance } from "@/queries/domains/useInstances";
import { isPresent } from "@/utils/types";

const props = defineProps<{
  instance: Instance;
}>();

const { instance } = toRefs(props);

const router = useRouter();
const notify = useNotify();
const deleteMutation = useDeleteInstance();

const instanceHost = computed(() => config.getInstanceHost(instance.value.id));

const displayName = computed(() => {
  const label = instance.value.label;
  if (isPresent(label) && label !== "") {
    return label;
  }
  return `Instance ${instance.value.id}`;
});

const formattedDate = computed(() => {
  return new Date(instance.value.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
});

const handleInstanceClick = () => {
  router.push(`/instances/${instance.value.id}`);
};

const handleCopyClick = async (event: Event) => {
  event.stopPropagation();
  await navigator.clipboard.writeText(instanceHost.value);
  notify.copied();
};

const handleDeleteClick = (event: Event) => {
  event.stopPropagation();
  if (instance.value.locked) {
    notify.error("Instance is locked");
    return;
  }
  deleteMutation.mutate(instance.value.id, {
    onSuccess: () => {
      notify.success(
        "Instance deleted",
        "Your instance has been deleted successfully",
      );
    },
    onError: (err: Error) => {
      notify.error("Failed to delete instance", err);
    },
  });
};
</script>

<template>
  <div
    :class="[
      'bg-white dark:bg-surface-800 border rounded-lg p-4 sm:p-5 transition-colors cursor-pointer',
      instance.locked
        ? 'border-surface-300 dark:border-surface-700/50 opacity-60'
        : 'border-surface-200 dark:border-surface-700 hover:border-primary',
    ]"
    @mousedown="handleInstanceClick"
  >
    <div
      class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 sm:justify-between"
    >
      <div class="shrink-0">
        <div class="flex items-center gap-2 mb-1">
          <h3
            class="text-base sm:text-lg font-semibold text-surface-900 dark:text-surface-0"
          >
            {{ displayName }}
          </h3>
          <i v-if="instance.locked" class="pi pi-lock text-surface-400" />
        </div>
        <div class="text-xs sm:text-sm text-surface-400">
          Created {{ formattedDate }}
        </div>
      </div>

      <div class="flex items-center gap-2">
        <InputText
          :value="instanceHost"
          readonly
          class="flex-1 sm:w-80 min-w-0 font-mono text-xs sm:text-sm"
          @mousedown.stop
        />
        <Button
          icon="pi pi-copy"
          severity="secondary"
          outlined
          size="small"
          class="shrink-0"
          @mousedown="handleCopyClick"
        />
        <Button
          :icon="deleteMutation.isPending.value ? 'pi pi-spin pi-spinner' : 'pi pi-trash'"
          severity="danger"
          outlined
          size="small"
          class="shrink-0"
          :disabled="instance.locked || deleteMutation.isPending.value"
          :loading="deleteMutation.isPending.value"
          @mousedown.stop
          @click="handleDeleteClick"
        />
      </div>
    </div>
  </div>
</template>
