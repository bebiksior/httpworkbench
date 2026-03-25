<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Tag from "primevue/tag";
import { useConfirm } from "primevue/useconfirm";
import type { Instance } from "shared";
import { computed, toRefs } from "vue";
import { useRouter } from "vue-router";
import { useNotify } from "@/composables";
import { config } from "@/config";
import {
  useCloneInstance,
  useDeleteInstance,
} from "@/queries/domains/useInstances";
import { isPresent } from "@/utils/types";

const props = defineProps<{
  instance: Instance;
}>();

const { instance } = toRefs(props);

const router = useRouter();
const notify = useNotify();
const confirm = useConfirm();
const deleteMutation = useDeleteInstance();
const cloneMutation = useCloneInstance();

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

const handleCloneClick = (event: Event) => {
  event.stopPropagation();
  confirm.require({
    message: `Create a duplicate of "${displayName.value}"?`,
    header: "Duplicate Instance",
    icon: "pi pi-copy",
    rejectProps: {
      label: "Cancel",
      severity: "secondary",
      outlined: true,
    },
    acceptProps: {
      label: "Duplicate",
    },
    accept: () => {
      cloneMutation.mutate(instance.value, {
        onSuccess: (clonedInstance) => {
          notify.success(
            "Instance cloned",
            "A copy of your instance has been created successfully",
          );
          void router.push(`/instances/${clonedInstance.id}`);
        },
        onError: (err: Error) => {
          notify.error("Failed to clone instance", err);
        },
      });
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
          <Tag
            v-if="instance.public"
            value="Public"
            severity="success"
            rounded
          />
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
          aria-label="Copy instance host"
          v-tooltip.top="'Copy host'"
          @mousedown.stop
          @click="handleCopyClick"
        />
        <Button
          :icon="
            cloneMutation.isPending.value
              ? 'pi pi-spin pi-spinner'
              : 'pi pi-clone'
          "
          severity="secondary"
          outlined
          size="small"
          class="shrink-0"
          aria-label="Duplicate instance"
          v-tooltip.top="'Duplicate instance'"
          :disabled="cloneMutation.isPending.value"
          :loading="cloneMutation.isPending.value"
          @mousedown.stop
          @click="handleCloneClick"
        />
        <span
          class="shrink-0 inline-flex"
          v-tooltip.top="
            instance.locked ? 'Unlock instance to delete' : 'Delete instance'
          "
        >
          <Button
            :icon="
              deleteMutation.isPending.value
                ? 'pi pi-spin pi-spinner'
                : 'pi pi-trash'
            "
            severity="danger"
            outlined
            size="small"
            aria-label="Delete instance"
            :disabled="instance.locked || deleteMutation.isPending.value"
            :loading="deleteMutation.isPending.value"
            @mousedown.stop
            @click="handleDeleteClick"
          />
        </span>
      </div>
    </div>
  </div>
</template>
