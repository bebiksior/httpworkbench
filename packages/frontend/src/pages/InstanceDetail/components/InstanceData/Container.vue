<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import ConfirmDialog from "primevue/confirmdialog";
import MultiSelect from "primevue/multiselect";
import Tag from "primevue/tag";
import { HttpEditor } from "@/components/HttpEditor";
import { GUEST_OWNER_ID, type Instance } from "shared";
import {
  toRefs,
  computed,
  watch,
  nextTick,
  type ComponentPublicInstance,
} from "vue";
import { useInstanceDataLogic } from "./useLogic";
import { useWebhooks } from "@/queries/domains/useWebhooks";

const props = defineProps<{
  instance: Instance;
}>();
const emit = defineEmits<{
  hidePanel: [];
}>();

const { instance } = toRefs(props);

const {
  instanceHost,
  rawContent,
  isDirty,
  isUpdating,
  isCloning,
  isDeleting,
  isClearingLogs,
  isLocked,
  isSettingLocked,
  handleSave,
  handleEditorChange,
  handleDelete,
  handleClone,
  handleClearLogs,
  handleToggleLock,
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
  canManageInstance,
  handleOpenBuilder,
  displayName,
  isEditingLabel,
  editLabel,
  labelInputRef,
  startEditingLabel,
  saveLabel,
  handleLabelKeydown,
  isPublic,
  isSettingPublic,
  handleTogglePublic,
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

const lockTooltip = computed(() => {
  if (isLocked.value) {
    return "Unlocking allows this instance to be deleted.";
  }
  return "Locking prevents accidental deletion. You can still edit and use the instance.";
});

const setFileInputRef = (el: Element | ComponentPublicInstance | null) => {
  fileInputRef.value = el instanceof HTMLInputElement ? el : null;
};

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

const visibilityLabel = computed(() => {
  return isPublic.value ? "Public" : "Private";
});

const visibilitySeverity = computed(() => {
  return isPublic.value ? "success" : "secondary";
});

const visibilityDescription = computed(() => {
  if (isPublic.value) {
    return "Anyone with this instance ID can open this page and view the logs and response.";
  }

  return "Only the owner can open this instance detail page.";
});

const showVisibility = computed(() => {
  return instance.value.ownerId !== GUEST_OWNER_ID;
});
</script>

<template>
  <ConfirmDialog />
  <div class="flex flex-col gap-8 h-full p-4">
    <div class="flex flex-col gap-6">
      <div>
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <template v-if="isEditingLabel">
              <input
                ref="labelInputRef"
                v-model="editLabel"
                type="text"
                maxlength="100"
                placeholder="Instance name..."
                class="min-w-0 w-full text-2xl font-bold text-surface-900 dark:text-surface-0 bg-surface-100 dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded px-2 py-0.5 focus:outline-none focus:border-primary"
                @keydown="handleLabelKeydown"
                @blur="saveLabel"
              />
            </template>
            <template v-else>
              <h2
                class="text-2xl font-bold text-surface-900 dark:text-surface-0 truncate"
              >
                {{ displayName }}
              </h2>
              <i v-if="isLocked" class="pi pi-lock text-surface-500 shrink-0" />
              <Tag
                v-if="showVisibility"
                :value="visibilityLabel"
                :severity="visibilitySeverity"
                rounded
              />
              <Button
                v-if="canManageInstance"
                icon="pi pi-pencil"
                severity="secondary"
                text
                size="small"
                class="shrink-0 p-1!"
                @click="startEditingLabel"
              />
            </template>
          </div>

          <Button
            severity="secondary"
            text
            rounded
            size="small"
            class="shrink-0"
            aria-label="Hide details panel"
            title="Hide details"
            @click="emit('hidePanel')"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect
                x="2.25"
                y="3.25"
                width="15.5"
                height="13.5"
                rx="2"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <path
                d="M7 3.25V16.75"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <path
                d="M12.75 10H9.75"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
              <path
                d="M11.25 8.5L9.75 10L11.25 11.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </Button>
        </div>
        <span class="text-sm text-surface-500">{{ formattedDate }}</span>
      </div>

      <div v-if="showVisibility" class="flex flex-col gap-2">
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

      <div class="flex flex-col gap-2">
        <label
          class="text-sm font-medium text-surface-700 dark:text-surface-300"
        >
          Visibility
        </label>
        <div
          class="flex flex-col gap-3 rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <Tag
                :value="visibilityLabel"
                :severity="visibilitySeverity"
                rounded
              />
              <span class="text-sm text-surface-700 dark:text-surface-200">
                {{ visibilityDescription }}
              </span>
            </div>
            <Button
              v-if="canManageInstance && !isGuest"
              :label="isPublic ? 'Make Private' : 'Make Public'"
              :icon="isPublic ? 'pi pi-lock' : 'pi pi-globe'"
              size="small"
              severity="secondary"
              outlined
              :loading="isSettingPublic"
              @click="handleTogglePublic"
            />
          </div>
          <p
            v-if="!canManageInstance"
            class="text-xs text-surface-500 dark:text-surface-400"
          >
            This instance is read-only for you.
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-2" v-if="!isGuest && canManageInstance">
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
          v-if="canManageInstance"
          :ref="setFileInputRef"
          type="file"
          class="hidden"
          accept=".txt,.json,.xml,.html"
          @change="handleFileUpload"
        />
        <Button
          v-if="canManageInstance"
          label="Upload"
          icon="pi pi-upload"
          severity="secondary"
          size="small"
          outlined
          class="flex-1"
          @click="triggerFileUpload"
        />
        <Button
          v-if="canManageInstance"
          label="Builder"
          icon="pi pi-wrench"
          size="small"
          severity="secondary"
          class="flex-1"
          @click="handleOpenBuilder"
        />
        <Button
          v-if="canManageInstance"
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
          :readonly="!canManageInstance"
          max-height="500px"
          @update:modelValue="handleEditorChange"
          @save="handleSave"
        />
      </div>
    </div>

    <div v-if="canManageInstance" class="flex flex-col gap-3 mt-auto">
      <h3
        class="font-semibold text-surface-900 dark:text-surface-0 border-b border-surface-200 dark:border-surface-700 pb-2"
      >
        Actions
      </h3>
      <div class="flex flex-col gap-2">
        <Button
          label="Clone Instance"
          icon="pi pi-clone"
          severity="secondary"
          outlined
          class="w-full justify-center"
          :loading="isCloning"
          @click="handleClone"
        />
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
          :label="isLocked ? 'Unlock Instance' : 'Lock Instance'"
          :icon="isLocked ? 'pi pi-lock-open' : 'pi pi-lock'"
          severity="secondary"
          outlined
          class="w-full justify-center"
          :loading="isSettingLocked"
          @click="handleToggleLock"
          v-tooltip.top="lockTooltip"
        />
        <Button
          label="Delete Instance"
          icon="pi pi-trash"
          severity="danger"
          outlined
          class="w-full justify-center"
          :loading="isDeleting"
          :disabled="isLocked"
          @click="handleDelete"
        />
      </div>
    </div>
  </div>
</template>
