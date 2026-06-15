<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { useConfirm } from "primevue/useconfirm";
import { computed, ref, watch } from "vue";
import type { ApiKey, ApiKeyScope, CreatedApiKey } from "shared";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "@/queries/domains/useApiKeys";

const scopeOptions: Array<{ value: ApiKeyScope; label: string }> = [
  { value: "instances:read", label: "Read instances" },
  { value: "instances:write", label: "Create and update instances" },
  { value: "instances:delete", label: "Delete instances" },
  { value: "logs:read", label: "Read logs" },
  { value: "logs:stream", label: "Watch logs" },
];

const {
  data: apiKeys,
  isLoading,
  error,
} = useApiKeys({
  enabled: true,
});
const createApiKeyMutation = useCreateApiKey();
const revokeApiKeyMutation = useRevokeApiKey();
const confirm = useConfirm();

const showCreateDialog = ref(false);
const name = ref("");
const selectedScopes = ref<ApiKeyScope[]>(
  scopeOptions.map((scope) => scope.value),
);
const createdApiKey = ref<CreatedApiKey | undefined>(undefined);
const copied = ref(false);
const activeApiKeys = computed(() => apiKeys.value ?? []);

watch(showCreateDialog, (isVisible) => {
  if (!isVisible) {
    name.value = "";
    selectedScopes.value = scopeOptions.map((scope) => scope.value);
    createdApiKey.value = undefined;
    copied.value = false;
    createApiKeyMutation.reset();
  }
});

const canCreate = computed(
  () => name.value.trim() !== "" && selectedScopes.value.length > 0,
);

const createApiKey = () => {
  if (!canCreate.value) {
    return;
  }

  createApiKeyMutation.mutate(
    {
      name: name.value.trim(),
      scopes: selectedScopes.value,
    },
    {
      onSuccess: (created) => {
        createdApiKey.value = created;
      },
    },
  );
};

const copyCreatedKey = async () => {
  if (createdApiKey.value === undefined) {
    return;
  }
  await navigator.clipboard.writeText(createdApiKey.value.secret);
  copied.value = true;
};

const revokeApiKey = (apiKey: ApiKey) => {
  confirm.require({
    message: `Revoke "${apiKey.name}"? Any clients using it will stop working.`,
    header: "Revoke API Key",
    icon: "pi pi-exclamation-triangle",
    rejectProps: {
      label: "Cancel",
      severity: "secondary",
      outlined: true,
    },
    acceptProps: {
      label: "Revoke",
      severity: "danger",
    },
    accept: () => {
      revokeApiKeyMutation.mutate(apiKey.id);
    },
  });
};

const formatDate = (timestamp?: number) => {
  if (timestamp === undefined) {
    return "Never";
  }
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatDateTime = (timestamp?: number) => {
  if (timestamp === undefined) {
    return "Never";
  }
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatScopes = (scopes: ApiKeyScope[]) => {
  if (scopeOptions.every((scope) => scopes.includes(scope.value))) {
    return "All";
  }

  return scopes
    .map(
      (scope) => scopeOptions.find((option) => option.value === scope)?.label,
    )
    .filter((scope): scope is string => scope !== undefined)
    .join(", ");
};
</script>

<template>
  <Dialog
    v-model:visible="showCreateDialog"
    header="Create API Key"
    :style="{ width: 'min(560px, calc(100vw - 2rem))' }"
    modal
  >
    <div class="flex flex-col gap-4">
      <Message
        v-if="createdApiKey !== undefined"
        severity="success"
        :closable="false"
      >
        Copy this key now. It will not be shown again.
      </Message>

      <div v-if="createdApiKey !== undefined" class="flex flex-col gap-3">
        <InputText
          :model-value="createdApiKey.secret"
          readonly
          class="w-full font-mono"
        />
        <div class="flex flex-col gap-2 sm:flex-row">
          <Button
            :label="copied ? 'Copied' : 'Copy Key'"
            :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
            class="flex-1"
            @click="copyCreatedKey"
          />
          <Button
            label="Done"
            icon="pi pi-check"
            severity="secondary"
            outlined
            class="flex-1"
            @click="showCreateDialog = false"
          />
        </div>
      </div>

      <template v-else>
        <Message
          v-if="createApiKeyMutation.isError.value"
          severity="error"
          :closable="true"
          @close="createApiKeyMutation.reset()"
        >
          {{
            createApiKeyMutation.error.value?.message ??
            "Failed to create API key"
          }}
        </Message>

        <div class="flex flex-col gap-2">
          <label
            for="api-key-name"
            class="text-sm font-medium text-surface-700 dark:text-surface-300"
          >
            Name
          </label>
          <InputText
            id="api-key-name"
            v-model="name"
            placeholder="Claude Desktop"
            class="w-full"
          />
        </div>

        <div class="flex flex-col gap-3">
          <span
            class="text-sm font-medium text-surface-700 dark:text-surface-300"
          >
            Scopes
          </span>
          <label
            v-for="scope in scopeOptions"
            :key="scope.value"
            class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-300"
          >
            <Checkbox
              v-model="selectedScopes"
              :input-id="scope.value"
              :value="scope.value"
            />
            <span>{{ scope.label }}</span>
          </label>
        </div>

        <Button
          label="Create API Key"
          icon="pi pi-key"
          :loading="createApiKeyMutation.isPending.value"
          :disabled="!canCreate"
          @click="createApiKey"
        />
      </template>
    </div>
  </Dialog>

  <div>
    <div
      class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
          API Keys
        </h2>
        <p
          class="mt-1 max-w-2xl text-sm text-surface-600 dark:text-surface-300"
        >
          Bearer keys for the HTTP Workbench API and MCP clients. Treat them
          like passwords.
        </p>
      </div>
      <Button
        label="Create API Key"
        icon="pi pi-key"
        class="w-full sm:w-auto"
        @click="showCreateDialog = true"
      />
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-6">
      {{ error?.message ?? "Unable to load API keys" }}
    </Message>

    <div v-if="isLoading" class="flex justify-center py-12">
      <i
        class="pi pi-spinner pi-spin text-4xl text-surface-500 dark:text-surface-300"
      />
    </div>
    <div
      v-else-if="activeApiKeys.length === 0"
      class="border-y border-surface-200 py-12 text-center dark:border-surface-800"
    >
      <p class="mb-1 text-sm text-surface-700 dark:text-surface-200">
        No API keys yet
      </p>
      <p class="mb-5 text-sm text-surface-500 dark:text-surface-400">
        Create one to start using the API or MCP.
      </p>
      <Button
        label="Create API Key"
        icon="pi pi-key"
        outlined
        @click="showCreateDialog = true"
      />
    </div>
    <div v-else class="overflow-x-auto">
      <DataTable :value="activeApiKeys" striped-rows class="min-w-[640px]">
        <Column field="name" header="Name" style="width: 22%" />
        <Column field="scopes" header="Scopes" style="width: 40%">
          <template #body="{ data }">
            <span class="text-sm text-surface-600 dark:text-surface-300">
              {{ formatScopes(data.scopes) }}
            </span>
          </template>
        </Column>
        <Column
          field="createdAt"
          header="Created"
          style="width: 14%"
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
          field="lastUsedAt"
          header="Last Used"
          style="width: 14%"
          header-style="white-space: nowrap"
        >
          <template #body="{ data }">
            <span
              v-tooltip.top="formatDateTime(data.lastUsedAt)"
              class="whitespace-nowrap"
            >
              {{ formatDate(data.lastUsedAt) }}
            </span>
          </template>
        </Column>
        <Column
          header="Actions"
          style="width: 10%"
          header-style="white-space: nowrap"
        >
          <template #body="{ data }">
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              size="small"
              @click="revokeApiKey(data)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
