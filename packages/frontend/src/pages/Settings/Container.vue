<script setup lang="ts">
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import Divider from "primevue/divider";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { useMediaQuery } from "@vueuse/core";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import type { Webhook } from "shared";
import { useWebhooks } from "@/queries/domains/useWebhooks";
import { useAuthStore } from "@/stores/auth";
import { WebhookList } from "./WebhookList";
import { WebhookForm } from "./WebhookForm";
import { OpenrouterKey } from "./OpenrouterKey";
import { UpdateCheck } from "./UpdateCheck";
import { ApiKeys } from "./ApiKeys";
import { Mcp } from "./Mcp";

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
const showDesktopDivider = useMediaQuery("(min-width: 640px)");
const sections = [
  { id: "openrouter", label: "OpenRouter", icon: "pi pi-sparkles" },
  { id: "api-keys", label: "API Keys", icon: "pi pi-key" },
  { id: "mcp", label: "MCP", icon: "pi pi-bolt" },
  { id: "webhooks", label: "Webhooks", icon: "pi pi-send" },
  { id: "version", label: "Version", icon: "pi pi-refresh" },
] as const;
type SettingsSectionId = (typeof sections)[number]["id"];
const activeSection = ref<SettingsSectionId>("mcp");

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
    :style="{ width: 'min(560px, calc(100vw - 2rem))' }"
    modal
  >
    <WebhookForm @created="handleWebhookCreated" />
  </Dialog>

  <Dialog
    v-model:visible="showEditDialog"
    header="Edit Webhook"
    :style="{ width: 'min(560px, calc(100vw - 2rem))' }"
    modal
  >
    <WebhookForm :webhook="editingWebhook" @updated="handleWebhookUpdated" />
  </Dialog>

  <div v-if="isGuest" class="h-full flex items-center justify-center px-6">
    <Message severity="info" :closable="false" class="max-w-xl text-center">
      API keys, MCP, and webhooks are available for authenticated users. Sign in
      to manage integrations.
    </Message>
  </div>
  <div
    v-else
    class="h-full overflow-x-hidden overflow-y-auto bg-surface-50 dark:bg-surface-900"
  >
    <div class="mx-auto max-w-7xl px-3 pt-4 pb-3 sm:px-6 sm:pt-8">
      <div class="flex items-start justify-between gap-3 sm:items-center">
        <div class="min-w-0">
          <h1
            class="text-2xl font-bold text-surface-900 dark:text-surface-0 sm:text-4xl"
          >
            Settings
          </h1>
          <p
            class="max-w-3xl text-sm text-surface-600 dark:text-surface-300 sm:text-base"
          >
            Manage OpenRouter, API keys, MCP clients, webhooks, and version
            checks.
          </p>
        </div>
        <Button
          icon="pi pi-arrow-left"
          aria-label="Back"
          outlined
          rounded
          class="shrink-0"
          @click="router.push('/')"
        />
      </div>
    </div>

    <Divider v-if="showDesktopDivider" class="mb-6" />

    <div
      class="mx-auto grid w-full max-w-7xl gap-4 px-3 pt-2 pb-8 sm:px-6 sm:pt-2 lg:grid-cols-[220px_1fr] lg:gap-8"
    >
      <aside class="min-w-0 lg:sticky lg:top-8 lg:self-start">
        <nav
          class="grid max-w-full grid-cols-3 gap-1 pb-2 lg:flex lg:flex-col lg:pb-0"
        >
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            class="flex min-w-0 cursor-pointer items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-center text-sm font-medium transition-colors lg:justify-start lg:border-b-0 lg:border-l-2 lg:px-3 lg:text-left"
            :class="
              activeSection === section.id
                ? 'border-primary-500 text-surface-900 dark:text-surface-0'
                : 'border-transparent text-surface-700 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-0'
            "
            @click="activeSection = section.id"
          >
            <i :class="section.icon" />
            <span class="min-w-0 truncate">{{ section.label }}</span>
          </button>
        </nav>
      </aside>

      <main class="settings-content min-w-0 max-w-full py-1 sm:py-2">
        <section v-if="activeSection === 'version'">
          <UpdateCheck />
        </section>

        <section v-else-if="activeSection === 'openrouter'">
          <OpenrouterKey />
        </section>

        <section v-else-if="activeSection === 'api-keys'">
          <ApiKeys />
        </section>

        <section v-else-if="activeSection === 'mcp'">
          <Mcp @navigate-to-api-keys="activeSection = 'api-keys'" />
        </section>

        <section v-else>
          <div
            class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2
                class="text-2xl font-semibold text-surface-900 dark:text-surface-0"
              >
                Webhooks
              </h2>
              <p
                class="mt-1 max-w-2xl text-sm text-surface-600 dark:text-surface-300"
              >
                Discord webhooks for HTTP Workbench notifications. Treat them
                like passwords.
              </p>
            </div>
            <Button
              label="Create Webhook"
              icon="pi pi-plus"
              class="w-full sm:w-auto"
              @click="showCreateDialog = true"
            />
          </div>

          <Message v-if="error" severity="error" :closable="false" class="mb-6">
            {{ error?.message ?? "Unable to load webhooks" }}
          </Message>

          <div v-if="isLoading" class="flex justify-center py-12">
            <i
              class="pi pi-spinner pi-spin text-4xl text-surface-500 dark:text-surface-300"
            />
          </div>
          <div
            v-else-if="webhooks && webhooks.length === 0"
            class="border-y border-surface-200 py-12 text-center dark:border-surface-800"
          >
            <p class="mb-1 text-sm text-surface-700 dark:text-surface-200">
              No webhooks yet
            </p>
            <p class="mb-5 text-sm text-surface-500 dark:text-surface-400">
              Create one to receive Discord notifications.
            </p>
            <Button
              label="Create Webhook"
              icon="pi pi-plus"
              outlined
              @click="showCreateDialog = true"
            />
          </div>
          <WebhookList
            v-else
            :webhooks="webhooks ?? []"
            :is-loading="isLoading"
            @edit="handleEdit"
          />
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.settings-content {
  overflow-wrap: anywhere;
}

.settings-content :deep(.p-button) {
  min-width: 0;
  max-width: 100%;
}

.settings-content :deep(.p-button-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-content :deep(.p-inputtext),
.settings-content :deep(.p-multiselect) {
  min-width: 0;
  max-width: 100%;
}
</style>
