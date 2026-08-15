<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Tag from "primevue/tag";
import { useConfirm } from "primevue/useconfirm";
import type { InstanceSummary } from "shared";
import { computed, toRefs } from "vue";
import { useRouter } from "vue-router";
import { useNotify } from "@/composables";
import { config } from "@/config";
import {
  useCloneInstance,
  useDeleteInstance,
} from "@/queries/domains/useInstances";
import { usePrefetchInstanceDetail } from "@/queries/domains/useInstanceDetail";
import { loadInstanceDetailPage } from "@/pages/InstanceDetail/load";
import { isPresent } from "@/utils/types";

const props = defineProps<{
  instance: InstanceSummary;
}>();

const { instance } = toRefs(props);

const router = useRouter();
const notify = useNotify();
const confirm = useConfirm();
const deleteMutation = useDeleteInstance();
const cloneMutation = useCloneInstance();
const prefetchInstanceDetail = usePrefetchInstanceDetail();

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

const handleCopyClick = async () => {
  await navigator.clipboard.writeText(instanceHost.value);
  notify.copied();
};

const handlePrefetch = () => {
  void Promise.all([
    loadInstanceDetailPage(),
    prefetchInstanceDetail(instance.value.id),
  ]);
};

const handleDeleteClick = () => {
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

const handleCloneClick = () => {
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
        onSuccess: async (clonedInstance) => {
          notify.success(
            "Instance cloned",
            "A copy of your instance has been created successfully",
          );
          await router.push(`/instances/${clonedInstance.id}`);
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
  <article
    :class="[
      'relative select-none bg-white dark:bg-surface-800 border rounded-lg p-3 sm:p-5 transition-colors',
      instance.locked
        ? 'border-surface-300 dark:border-surface-700/50 opacity-60'
        : 'border-surface-200 dark:border-surface-700 hover:border-primary',
    ]"
  >
    <RouterLink
      :to="`/instances/${instance.id}`"
      class="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-label="`Open ${displayName}`"
      @pointerenter="handlePrefetch"
      @pointerdown="handlePrefetch"
      @focus="handlePrefetch"
    />
    <div
      class="pointer-events-none relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <div class="min-w-0 shrink-0">
        <div class="flex items-center gap-2 mb-1">
          <h2
            class="min-w-0 truncate text-base font-semibold text-surface-900 dark:text-surface-0 sm:text-lg"
          >
            {{ displayName }}
          </h2>
          <Tag
            v-if="instance.public"
            value="Public"
            severity="success"
            rounded
          />
          <i v-if="instance.locked" class="pi pi-lock text-surface-400" />
        </div>
        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm"
        >
          <span>
            <span class="text-surface-400">Created</span>
            <span
              class="ml-1 text-[11px] text-surface-600 dark:text-surface-200 sm:text-xs"
            >
              {{ formattedDate }}
            </span>
          </span>
          <span>
            <span class="text-surface-400">Logs</span>
            <span
              class="ml-1 text-[11px] text-surface-600 dark:text-surface-200 sm:text-xs"
            >
              {{ instance.logCount.toLocaleString() }}
            </span>
          </span>
        </div>
      </div>

      <div
        class="pointer-events-auto relative z-10 flex min-w-0 items-center gap-1.5 sm:gap-2"
      >
        <InputText
          :value="instanceHost"
          readonly
          :aria-label="`Host for ${displayName}`"
          class="min-w-0 flex-1 select-text font-mono text-xs sm:w-80 sm:text-sm"
        />
        <Button
          icon="pi pi-copy"
          severity="secondary"
          outlined
          size="small"
          class="shrink-0"
          aria-label="Copy instance host"
          v-tooltip.top="'Copy host'"
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
            @click="handleDeleteClick"
          />
        </span>
      </div>
    </div>
  </article>
</template>
