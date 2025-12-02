<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import ConfirmDialog from "primevue/confirmdialog";
import MultiSelect from "primevue/multiselect";
import { HttpEditor } from "@/components/HttpEditor";
import type { Instance } from "shared";
import { toRefs, computed, watch, nextTick } from "vue";
import { useInstanceDataLogic } from "./useLogic";
import { useWebhooks } from "@/queries/domains/useWebhooks";

const props = defineProps<{
  instance: Instance;
}>();

const { instance } = toRefs(props);

const {
  instanceHost,
  rawContent,
  isDirty,
  isUpdating,
  isDeleting,
  isClearingLogs,
  handleSave,
  handleEditorChange,
  handleDelete,
  handleClearLogs,
  handleFileUpload,
  fileInputRef,
  triggerFileUpload,
  handleCopy,
  selectedWebhookIds,
  showExpirationNotice,
  expirationText,
  expirationExact,
  isExtending,
  handleExtend,
  isGuest,
  handleOpenBuilder,
  displayName,
  isEditingLabel,
  editLabel,
  labelInputRef,
  startEditingLabel,
  saveLabel,
  handleLabelKeydown,
} = useInstanceDataLogic(instance);

const { data: webhooks } = useWebhooks({
  enabled: computed(() => !isGuest.value),
});

const webhookOptions = computed(() => {
  return (webhooks.value ?? []).map((webhook) => ({
    label: webhook.name,
    value: webhook.id,
  }));
});

watch(isEditingLabel, (editing) => {
  if (editing) {
    nextTick(() => {
      labelInputRef.value?.focus();
      labelInputRef.value?.select();
    });
  }
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
</script>

<template>
  <ConfirmDialog />
  <div class="flex flex-col gap-8 h-full">
    <div class="flex flex-col gap-6">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <template v-if="isEditingLabel">
            <input
              ref="labelInputRef"
              v-model="editLabel"
              type="text"
              maxlength="100"
              placeholder="Instance name..."
              class="text-2xl font-bold text-surface-900 dark:text-surface-0 bg-surface-100 dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded px-2 py-0.5 w-64 focus:outline-none focus:border-primary"
              @keydown="handleLabelKeydown"
              @blur="saveLabel"
            />
          </template>
          <template v-else>
            <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-0">
              {{ displayName }}
            </h2>
            <Button
              v-if="!isGuest"
              icon="pi pi-pencil"
              severity="secondary"
              text
              size="small"
              class="shrink-0 p-1!"
              @click="startEditingLabel"
            />
          </template>
        </div>
        <span class="text-sm text-surface-500">{{ formattedDate }}</span>
      </div>

      <div class="flex flex-col gap-2">
        <label
          class="text-sm font-medium text-surface-700 dark:text-surface-300"
        >
          Subdomain
        </label>
        <div class="flex gap-2">
          <InputText
            :value="instanceHost"
            readonly
            class="w-full font-mono text-sm bg-surface-50 dark:bg-surface-800"
          />
          <Button
            icon="pi pi-copy"
            severity="secondary"
            outlined
            @click="handleCopy"
          />
        </div>
        <p class="text-xs text-surface-500">
          Send HTTP requests to this subdomain to see them appear in the logs.
          Supports HTTP and HTTPS protocols.
        </p>
      </div>

      <div class="flex flex-col gap-2" v-if="!isGuest">
        <label
          class="text-sm font-medium text-surface-700 dark:text-surface-300"
        >
          Webhooks
        </label>
        <div class="flex flex-col gap-2">
          <MultiSelect
            v-model="selectedWebhookIds"
            :options="webhookOptions"
            option-label="label"
            option-value="value"
            placeholder="Select webhooks to notify"
            class="w-full"
            display="chip"
          />
          <p class="text-xs text-surface-500">
            Discord webhooks will be notified when logs are created for this
            instance.
          </p>
        </div>
      </div>
    </div>

    <div
      v-if="showExpirationNotice"
      class="flex items-center justify-between gap-4 p-3 rounded-lg bg-surface-50 dark:bg-surface-800"
    >
      <div>
        <p class="text-sm font-medium text-surface-900 dark:text-surface-0">
          {{ expirationText }}
        </p>
        <p v-if="expirationExact" class="text-xs text-surface-500">
          {{ expirationExact }}
        </p>
      </div>
      <Button
        v-if="!isGuest"
        label="Extend"
        icon="pi pi-refresh"
        size="small"
        :loading="isExtending"
        @click="handleExtend"
      />
      <span v-else class="text-xs text-surface-500">
        Guest instances cannot be extended.
      </span>
    </div>

    <div v-if="instance.kind === 'static'" class="flex flex-col gap-3 flex-1">
      <div
        class="flex justify-between items-end border-b border-surface-200 dark:border-surface-700 pb-2"
      >
        <div>
          <h3 class="font-semibold text-surface-900 dark:text-surface-0">
            Response Body
          </h3>
          <p class="text-xs text-surface-500 mt-1">
            Customize the response returned by this instance.
          </p>
        </div>
      </div>

      <div class="flex gap-2 mb-2">
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          accept=".txt,.json,.xml,.html"
          @change="handleFileUpload"
        />
        <Button
          label="Upload"
          icon="pi pi-upload"
          severity="secondary"
          size="small"
          outlined
          class="flex-1"
          @click="triggerFileUpload"
        />
        <Button
          v-if="!isGuest"
          label="Builder"
          icon="pi pi-wrench"
          size="small"
          severity="secondary"
          class="flex-1"
          @click="handleOpenBuilder"
        />
        <Button
          label="Save"
          icon="pi pi-save"
          size="small"
          class="flex-1"
          :loading="isUpdating"
          :disabled="!isDirty"
          @click="handleSave"
        />
      </div>

      <div class="flex-1 h-[400px] max-h-[400px] rounded-md overflow-hidden">
        <HttpEditor
          :model-value="rawContent"
          :is-dirty="isDirty"
          max-height="500px"
          @update:modelValue="handleEditorChange"
          @save="handleSave"
        />
      </div>
    </div>

    <div class="flex flex-col gap-3 mt-auto pb-4">
      <h3
        class="font-semibold text-surface-900 dark:text-surface-0 border-b border-surface-200 dark:border-surface-700 pb-2"
      >
        Actions
      </h3>
      <div class="flex flex-col gap-2">
        <Button
          label="Clear Logs"
          icon="pi pi-ban"
          severity="secondary"
          outlined
          class="w-full justify-center"
          :loading="isClearingLogs"
          @click="handleClearLogs"
        />
        <Button
          label="Delete Instance"
          icon="pi pi-trash"
          severity="danger"
          outlined
          class="w-full justify-center"
          :loading="isDeleting"
          @click="handleDelete"
        />
      </div>
    </div>
  </div>
</template>
