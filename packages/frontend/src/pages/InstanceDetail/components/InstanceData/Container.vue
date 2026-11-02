<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Dialog from "primevue/dialog";
import MultiSelect from "primevue/multiselect";
import Tag from "primevue/tag";
import { HttpEditor } from "@/components/HttpEditor";
import { GUEST_OWNER_ID, type Instance } from "shared";
import {
  ref,
  toRefs,
  computed,
  watch,
  nextTick,
  type ComponentPublicInstance,
} from "vue";
import ResponseStack from "./ResponseStack.vue";
import { config } from "@/config";
import { useNotify } from "@/composables";
import { useInstanceDataLogic } from "./useLogic";
import { useConfirm } from "primevue/useconfirm";
import { useEventListener } from "@vueuse/core";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from "vue-router";
import { createLeaveGuard } from "@/pages/PoCBuilder/exitBuilder";
import { useWebhooks } from "@/queries/domains/useWebhooks";

const props = defineProps<{
  instance: Instance;
  requestedResponse?: { label: string };
}>();
const emit = defineEmits<{
  hidePanel: [];
}>();

const { instance, requestedResponse } = toRefs(props);

const {
  instanceHost,
  editorContent,
  routeDrafts,
  routeErrors,
  selectedResponse,
  activeRoute,
  isDirty,
  canSave,
  canAddRoute,
  rawContent,
  isAdvanced,
  enterAdvanced,
  enterBasic,
  dirtyResponses,
  pathFocusRequest,
  tabFocusRequest,
  selectResponse,
  selectResponseByLabel,
  discardChanges,
  addRoute,
  removeRoute,
  setRoutePath,
  setRouteMethod,
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
  handleWebhookChange,
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

const router = useRouter();
const notify = useNotify();
const instanceUrl = computed(() => config.getInstanceUrl(instance.value.id));
const copyUrl = async (url: string, unsaved: boolean) => {
  await navigator.clipboard.writeText(url);
  if (unsaved) {
    notify.success("Copied. Save to make this path live");
    return;
  }
  notify.copied();
};

const { data: webhooks } = useWebhooks({
  enabled: computed(() => canManageInstance.value && !isGuest.value),
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

const showVisibility = computed(() => {
  return instance.value.ownerId !== GUEST_OWNER_ID;
});

const isWebhooksDialogVisible = ref(false);

const editorLabel = ref("Default response");
watch(
  selectedResponse,
  () => {
    editorLabel.value =
      activeRoute.value === undefined
        ? "Response for every other request"
        : `Response for ${activeRoute.value.path}`;
  },
  { immediate: true },
);

const confirmLeave = useConfirm();

const responseModes = [
  {
    value: "basic",
    label: "Basic",
    advanced: false,
    hint: "One response for every request",
  },
  {
    value: "advanced",
    label: "Advanced",
    advanced: true,
    hint: "Different responses per path. Most specific match wins.",
  },
];

const setMode = (advanced: boolean) => {
  if (advanced) {
    enterAdvanced();
    return;
  }
  if (!isAdvanced.value) return;
  if (routeDrafts.value.length === 0) {
    enterBasic();
    return;
  }
  confirmLeave.require({
    message: `Remove ${routeDrafts.value.length === 1 ? "the path response" : `all ${routeDrafts.value.length} path responses`}? Only Every other request will be kept. Nothing changes until you save.`,
    header: "Switch to Basic",
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
    acceptProps: { label: "Remove paths", severity: "danger" },
    accept: enterBasic,
  });
};

watch(requestedResponse, (request) => {
  if (request !== undefined) {
    selectResponseByLabel(request.label);
  }
});

const leaveGuard = createLeaveGuard({
  isDirty: () => isDirty.value,
  markClean: discardChanges,
  confirmLeave: (accept) => {
    confirmLeave.require({
      message: "You have unsaved response changes. Leave without saving?",
      header: "Unsaved Changes",
      icon: "pi pi-exclamation-triangle",
      rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
      acceptProps: { label: "Leave", severity: "danger" },
      accept,
    });
  },
  navigate: (target) => {
    router.push(target);
  },
});

onBeforeRouteLeave((to, _from, next) => leaveGuard(to, next));
onBeforeRouteUpdate((to, from, next) =>
  to.params.id === from.params.id ? next() : leaveGuard(to, next),
);
useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (isDirty.value) {
    event.preventDefault();
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-5 p-3 sm:gap-8 sm:p-4">
    <div class="flex flex-col gap-5 sm:gap-6">
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
                aria-label="Instance name"
                class="min-w-0 w-full text-2xl font-bold text-surface-900 dark:text-surface-0 bg-surface-100 dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded px-2 py-0.5 focus:outline-none focus:border-primary"
                @keydown="handleLabelKeydown"
                @blur="saveLabel"
              />
            </template>
            <template v-else>
              <h2
                class="truncate text-xl font-bold text-surface-900 dark:text-surface-0 sm:text-2xl"
              >
                {{ displayName }}
              </h2>
              <i
                v-if="isLocked"
                class="pi pi-lock text-surface-600 dark:text-surface-400 shrink-0"
              />
              <Tag
                v-if="showVisibility && isPublic"
                value="Public"
                severity="success"
                rounded
              />
              <Button
                v-if="canManageInstance"
                icon="pi pi-pencil"
                severity="secondary"
                text
                size="small"
                class="shrink-0 p-1!"
                aria-label="Edit instance name"
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
        <span class="text-sm text-surface-600 dark:text-surface-400">
          {{ formattedDate }}
        </span>
      </div>

      <div class="flex flex-col gap-2">
        <label
          for="instance-host-input"
          class="text-sm font-medium text-surface-700 dark:text-surface-300"
        >
          Hostname
        </label>
        <div class="flex gap-2">
          <InputText
            id="instance-host-input"
            :value="instanceHost"
            readonly
            size="small"
            aria-label="Interaction host"
            class="min-w-0 w-full bg-surface-50 font-mono text-sm dark:bg-surface-800"
          />
          <Button
            icon="pi pi-copy"
            severity="secondary"
            outlined
            size="small"
            aria-label="Copy interaction host"
            @click="handleCopy"
          />
        </div>
        <p class="text-xs text-surface-600 dark:text-surface-400">
          Send HTTP, HTTPS, DNS, and SMTP requests to this host to see them
          appear in the logs.
        </p>
      </div>
    </div>

    <div
      class="flex flex-col gap-3"
      :class="isAdvanced ? 'shrink-0' : 'min-h-[320px] flex-1 lg:min-h-0'"
    >
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-semibold text-surface-900 dark:text-surface-0">
          Response
        </h3>
        <div
          v-if="canManageInstance && !isGuest"
          class="inline-flex rounded-lg bg-surface-100 p-0.5 dark:bg-surface-800"
          role="radiogroup"
          aria-label="Response mode"
        >
          <button
            v-for="mode in responseModes"
            :key="mode.value"
            type="button"
            role="radio"
            :aria-checked="isAdvanced === mode.advanced"
            class="h-7 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            :class="
              isAdvanced === mode.advanced
                ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-950 dark:text-surface-0'
                : 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'
            "
            v-tooltip.top="mode.hint"
            @click="setMode(mode.advanced)"
          >
            {{ mode.label }}
          </button>
        </div>
      </div>

      <ResponseStack
        v-if="isAdvanced"
        :drafts="routeDrafts"
        :fallback-raw="rawContent"
        :errors="routeErrors"
        :dirty="dirtyResponses"
        :selected="selectedResponse"
        :editable="canManageInstance"
        :can-add="canAddRoute"
        :base-url="instanceUrl"
        :focus-path-request="pathFocusRequest"
        :focus-tab-request="tabFocusRequest"
        @select="selectResponse"
        @add="addRoute"
        @remove="removeRoute"
        @upload="triggerFileUpload"
        @copy="copyUrl"
        @set-path="setRoutePath"
        @set-method="setRouteMethod"
      >
        <HttpEditor
          :key="selectedResponse"
          flush
          :aria-label="editorLabel"
          :model-value="editorContent"
          :is-dirty="canSave"
          :readonly="!canManageInstance"
          syntax="response"
          @update:modelValue="handleEditorChange"
          @save="handleSave"
        />
      </ResponseStack>
      <div
        v-else
        class="h-72 min-h-0 overflow-hidden rounded-md lg:h-auto lg:min-h-64 lg:flex-1"
      >
        <HttpEditor
          aria-label="Response"
          :model-value="editorContent"
          :is-dirty="canSave"
          :readonly="!canManageInstance"
          syntax="response"
          @update:modelValue="handleEditorChange"
          @save="handleSave"
        />
      </div>

      <div v-if="canManageInstance" class="flex items-center justify-end gap-1">
        <input
          :ref="setFileInputRef"
          type="file"
          class="hidden"
          accept=".txt,.json,.xml,.html"
          @change="handleFileUpload"
        />
        <template v-if="!isAdvanced">
          <Button
            icon="pi pi-wrench"
            label="Builder"
            severity="secondary"
            text
            size="small"
            @click="handleOpenBuilder"
          />
          <Button
            icon="pi pi-upload"
            label="Upload"
            severity="secondary"
            text
            size="small"
            @click="triggerFileUpload"
          />
        </template>
        <Button
          label="Save"
          size="small"
          :outlined="!isDirty"
          :severity="isDirty ? undefined : 'secondary'"
          class="ml-1 min-w-20"
          :loading="isUpdating"
          :disabled="!canSave"
          @click="handleSave"
        />
      </div>
    </div>

    <div
      v-if="canManageInstance || showExpirationNotice"
      class="mt-auto flex flex-col gap-3"
    >
      <div
        v-if="showExpirationNotice"
        class="flex min-w-0 items-center gap-2 rounded-md bg-surface-50 px-2 py-1 text-xs dark:bg-surface-800 sm:px-3"
      >
        <i
          class="pi pi-clock text-[10px] text-surface-600 dark:text-surface-400"
          aria-hidden="true"
        />
        <span
          class="shrink-0 whitespace-nowrap text-surface-800 dark:text-surface-200"
        >
          {{ expirationText }}
        </span>
        <span
          v-if="expirationExact"
          class="flex-1 truncate text-surface-600 dark:text-surface-400"
        >
          {{ expirationExact }}
        </span>
        <Button
          v-if="!isGuest"
          icon="pi pi-refresh"
          severity="secondary"
          text
          rounded
          size="small"
          class="-mr-1 shrink-0 p-1!"
          aria-label="Extend expiration"
          v-tooltip.top="'Extend'"
          :loading="isExtending"
          @click="handleExtend"
        />
      </div>

      <div
        v-if="canManageInstance"
        class="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        <Button
          label="Clone"
          icon="pi pi-clone"
          severity="secondary"
          outlined
          size="small"
          class="min-w-0 justify-center"
          :loading="isCloning"
          @click="handleClone"
        />
        <Button
          label="Clear Logs"
          icon="pi pi-ban"
          severity="secondary"
          outlined
          size="small"
          class="min-w-0 justify-center"
          :loading="isClearingLogs"
          @click="handleClearLogs"
        />
        <Button
          :label="isLocked ? 'Unlock' : 'Lock'"
          :icon="isLocked ? 'pi pi-lock-open' : 'pi pi-lock'"
          severity="secondary"
          outlined
          size="small"
          class="min-w-0 justify-center"
          :loading="isSettingLocked"
          @click="handleToggleLock"
          v-tooltip.top="lockTooltip"
        />
        <Button
          v-if="!isGuest"
          :label="
            selectedWebhookIds.length > 0
              ? `Webhooks (${selectedWebhookIds.length})`
              : 'Webhooks'
          "
          icon="pi pi-bell"
          severity="secondary"
          outlined
          size="small"
          class="min-w-0 justify-center"
          @click="isWebhooksDialogVisible = true"
        />
        <Button
          v-if="showVisibility"
          :label="isPublic ? 'Make Private' : 'Make Public'"
          :icon="isPublic ? 'pi pi-lock' : 'pi pi-globe'"
          severity="secondary"
          outlined
          size="small"
          class="min-w-0 justify-center"
          :loading="isSettingPublic"
          @click="handleTogglePublic"
          v-tooltip.top="
            isPublic
              ? 'Revoke public access to this instance'
              : 'Allow anyone with the ID to view details and logs of this instance'
          "
        />
        <Button
          label="Delete"
          icon="pi pi-trash"
          severity="danger"
          outlined
          size="small"
          class="min-w-0 justify-center"
          :loading="isDeleting"
          :disabled="isLocked"
          @click="handleDelete"
        />
      </div>
    </div>

    <Dialog
      v-model:visible="isWebhooksDialogVisible"
      modal
      header="Webhooks"
      :style="{ width: '40rem' }"
      :breakpoints="{ '640px': '95vw' }"
    >
      <div class="flex flex-col gap-3">
        <MultiSelect
          :model-value="selectedWebhookIds"
          :options="webhookOptions"
          option-label="label"
          option-value="value"
          placeholder="Select webhooks to notify"
          aria-label="Webhooks"
          class="w-full"
          size="small"
          display="chip"
          :loading="isUpdating"
          :disabled="isUpdating"
          @update:model-value="handleWebhookChange"
        />
        <p class="text-xs text-surface-600 dark:text-surface-400">
          Selected Discord webhooks will be notified when logs are created for
          this instance. Changes save automatically.
        </p>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
:deep(.p-button) {
  min-width: 0;
}

:deep(.p-button-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
