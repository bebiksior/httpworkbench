<script setup lang="ts">
import Button from "primevue/button";
import Divider from "primevue/divider";
import ConfirmDialog from "primevue/confirmdialog";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import type { Webhook } from "shared";
import { useWebhooks } from "@/queries/domains/useWebhooks";
import { useAuthStore } from "@/stores";
import { WebhookList } from "./WebhookList";
import { WebhookForm } from "./WebhookForm";
import { OpenrouterKey } from "./OpenrouterKey";
import { UpdateCheck } from "./UpdateCheck";

const router = useRouter();
const authStore = useAuthStore();
const { isGuest } = storeToRefs(authStore);
const {
  data: webhooks,
  isLoading,
  error,
} = useWebhooks({
  enabled: computed(() => !isGuest.value),
});
const showCreateDialog = ref(false);
const showEditDialog = ref(false);
const editingWebhook = ref<Webhook | undefined>(undefined);

const handleWebhookCreated = () => {
  showCreateDialog.value = false;
};

const handleWebhookUpdated = () => {
  showEditDialog.value = false;
  editingWebhook.value = undefined;
};

const handleEdit = (webhook: Webhook) => {
  editingWebhook.value = webhook;
  showEditDialog.value = true;
};
</script>

<template>
  <ConfirmDialog />
  <Dialog
    v-model:visible="showCreateDialog"
    header="Create Webhook"
    :style="{ width: '500px' }"
    modal
  >
    <WebhookForm @created="handleWebhookCreated" />
  </Dialog>

  <Dialog
    v-model:visible="showEditDialog"
    header="Edit Webhook"
    :style="{ width: '500px' }"
    modal
  >
    <WebhookForm :webhook="editingWebhook" @updated="handleWebhookUpdated" />
  </Dialog>

  <div v-if="isGuest" class="h-full flex items-center justify-center px-6">
    <Message severity="info" :closable="false" class="max-w-xl text-center">
      Webhooks are available for authenticated users. Sign in to manage
      notifications.
    </Message>
  </div>
  <div v-else class="h-full overflow-y-auto bg-surface-50 dark:bg-surface-900">
    <div class="mx-auto max-w-7xl px-6 pt-8 pb-2">
      <div class="flex items-center justify-between mb-2">
        <div>
          <h1 class="text-4xl font-bold text-surface-900 dark:text-surface-0">
            Settings
          </h1>
          <p class="text-surface-400">
            Manage your settings like API keys and webhooks.
          </p>
        </div>
        <Button
          label="Back"
          icon="pi pi-arrow-left"
          outlined
          @click="router.push('/')"
        />
      </div>
    </div>

    <Divider class="mb-6" />

    <div class="mx-auto max-w-7xl px-6 pt-2 pb-8">
      <UpdateCheck />
      <OpenrouterKey />

      <div
        class="bg-white dark:bg-surface-900/70 border border-surface-200 dark:border-surface-800 rounded-2xl p-6"
      >
        <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2
              class="text-2xl font-semibold text-surface-900 dark:text-surface-0"
            >
              Webhooks
            </h2>
            <p class="text-sm text-surface-400 mt-1 max-w-2xl">
              Manage your webhooks and notifications to receive updates.
            </p>
          </div>
          <Button
            label="Create Webhook"
            icon="pi pi-plus"
            @click="showCreateDialog = true"
          />
        </div>

        <Message v-if="error" severity="error" :closable="false" class="mb-6">
          {{ error?.message ?? "Unable to load webhooks" }}
        </Message>

        <div v-if="isLoading" class="flex justify-center py-16">
          <i class="pi pi-spinner pi-spin text-4xl text-surface-400" />
        </div>
        <div
          v-else-if="webhooks && webhooks.length === 0"
          class="text-center py-16"
        >
          <i class="pi pi-inbox text-6xl text-surface-400 mb-4" />
          <p class="text-lg text-surface-500 mb-2">No webhooks configured</p>
          <p class="text-sm text-surface-400 mb-6">
            Create your first webhook to receive Discord notifications
          </p>
          <Button
            label="Create Webhook"
            icon="pi pi-plus"
            @click="showCreateDialog = true"
          />
        </div>
        <WebhookList
          v-else
          :webhooks="webhooks ?? []"
          :is-loading="isLoading"
          @edit="handleEdit"
        />
      </div>
    </div>
  </div>
</template>
