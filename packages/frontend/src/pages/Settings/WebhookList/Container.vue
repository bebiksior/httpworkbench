<script setup lang="ts">
import Button from "primevue/button";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import { useConfirm } from "primevue/useconfirm";
import type { Webhook } from "shared";
import { toRefs } from "vue";
import { useDeleteWebhook } from "@/queries/domains/useWebhooks";

const props = defineProps<{
  webhooks: Webhook[];
  isLoading: boolean;
}>();

const emit = defineEmits<{
  (e: "edit", webhook: Webhook): void;
}>();

const { webhooks, isLoading } = toRefs(props);

const confirm = useConfirm();
const deleteWebhookMutation = useDeleteWebhook();

const handleDelete = (webhook: Webhook) => {
  confirm.require({
    message: `Are you sure you want to delete "${webhook.name}"?`,
    header: "Confirm Deletion",
    icon: "pi pi-exclamation-triangle",
    rejectProps: {
      label: "Cancel",
      severity: "secondary",
      outlined: true,
    },
    acceptProps: {
      label: "Delete",
      severity: "danger",
    },
    accept: () => {
      deleteWebhookMutation.mutate(webhook.id);
    },
  });
};

const handleEdit = (webhook: Webhook) => {
  emit("edit", webhook);
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatDateTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const truncateMessage = (message?: string, maxLength = 45) => {
  if (message === undefined || message === "") {
    return "Default embed only";
  }

  if (message.length <= maxLength) {
    return message;
  }

  return message.substring(0, maxLength) + "...";
};
</script>

<template>
  <div class="overflow-x-auto">
    <DataTable
      :value="webhooks"
      :loading="isLoading"
      striped-rows
      class="min-w-[560px]"
    >
      <Column field="name" header="Name" style="width: 25%" />
      <Column field="message" header="Message" style="width: 45%">
        <template #body="{ data }">
          <span
            class="block truncate text-sm"
            :class="{
              'font-mono': data.message !== undefined,
              'text-surface-600 dark:text-surface-300':
                data.message === undefined,
            }"
            :title="data.message ?? 'Default embed only'"
          >
            {{ truncateMessage(data.message) }}
          </span>
        </template>
      </Column>
      <Column
        field="createdAt"
        header="Created"
        style="width: 18%"
        header-style="white-space: nowrap"
      >
        <template #body="{ data }">
          <span
            v-tooltip.top="formatDateTime(data.createdAt)"
            class="whitespace-nowrap"
          >
            {{ formatDate(data.createdAt) }}
          </span>
        </template>
      </Column>
      <Column
        header="Actions"
        style="width: 12%"
        header-style="white-space: nowrap"
      >
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button
              icon="pi pi-pencil"
              severity="secondary"
              text
              size="small"
              @click="handleEdit(data)"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              size="small"
              @click="handleDelete(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
