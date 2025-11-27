import { useConfirm } from "primevue/useconfirm";
import type { Instance } from "shared";
import { computed, ref, watch, type Ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useTimeAgo } from "@vueuse/core";
import dayjs from "dayjs";
import { useNotify } from "@/composables";
import { config } from "@/config";
import {
  useClearLogs,
  useDeleteInstance,
  useExtendInstance,
  useRenameInstance,
  useUpdateInstance,
} from "@/queries/domains/useInstances";
import { useAuthStore } from "@/stores";
import { isAbsent, isPresent } from "@/utils/types";
import { useFileUpload } from "./useFileUpload";

export const useInstanceDataLogic = (instance: Ref<Instance>) => {
  const notify = useNotify();
  const confirm = useConfirm();
  const router = useRouter();
  const { processFile } = useFileUpload();
  const { mutateAsync: updateInstanceMutation, isPending: isUpdating } =
    useUpdateInstance();
  const { mutateAsync: deleteInstanceMutation, isPending: isDeleting } =
    useDeleteInstance();
  const { mutateAsync: clearLogsMutation, isPending: isClearingLogs } =
    useClearLogs();
  const { mutateAsync: extendInstanceMutation, isPending: isExtending } =
    useExtendInstance();
  const { mutateAsync: renameInstanceMutation } = useRenameInstance();

  const authStore = useAuthStore();
  const { isGuest } = storeToRefs(authStore);

  const instanceHost = computed(() =>
    config.getInstanceHost(instance.value.id),
  );

  const rawContent = ref("");
  const isDirty = ref(false);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const selectedWebhookIds = ref<string[]>([]);
  const isEditingLabel = ref(false);
  const editLabel = ref("");
  const labelInputRef = ref<HTMLInputElement | null>(null);
  const isSavingViaEnter = ref(false);

  const displayName = computed(() => {
    const label = instance.value.label;
    if (isPresent(label) && label !== "") {
      return label;
    }
    return `Instance ${instance.value.id}`;
  });
  const expirationTimestamp = computed(() => instance.value.expiresAt);
  const expirationDate = computed(() => {
    if (isAbsent(expirationTimestamp.value)) {
      return undefined;
    }
    return dayjs(expirationTimestamp.value);
  });
  const expirationExact = computed(() => {
    if (isAbsent(expirationDate.value)) {
      return undefined;
    }
    return expirationDate.value.format("MMM D, YYYY h:mm A");
  });
  const expirationTimeAgo = useTimeAgo(
    computed(() => expirationTimestamp.value ?? Date.now()),
  );
  const expirationText = computed(() => {
    if (isAbsent(expirationTimestamp.value)) {
      return undefined;
    }
    const relative = expirationTimeAgo.value;
    if (expirationTimestamp.value >= Date.now()) {
      return `Expires ${relative}`;
    }
    return `Expired ${relative}`;
  });
  const showExpirationNotice = computed(() =>
    isPresent(instance.value.expiresAt),
  );

  watch(
    instance,
    (newInstance) => {
      if (newInstance?.kind === "static" && !isDirty.value) {
        rawContent.value = newInstance.raw;
      }
      if (isPresent(newInstance)) {
        selectedWebhookIds.value = newInstance.webhookIds;
      }
    },
    { immediate: true },
  );

  watch(selectedWebhookIds, async (newWebhookIds, oldWebhookIds) => {
    if (isGuest.value || isAbsent(oldWebhookIds)) {
      return;
    }

    try {
      if (instance.value.kind === "static") {
        await updateInstanceMutation({
          id: instance.value.id,
          input: {
            kind: "static",
            raw: instance.value.raw,
            webhookIds: newWebhookIds,
          },
        });
      } else {
        await updateInstanceMutation({
          id: instance.value.id,
          input: {
            kind: "dynamic",
            processors: instance.value.processors,
            webhookIds: newWebhookIds,
          },
        });
      }
    } catch (e) {
      notify.error("Failed to update webhooks", e);
      selectedWebhookIds.value = oldWebhookIds;
    }
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(instanceHost.value);
    notify.copied();
  };

  const handleSave = async () => {
    if (instance.value?.kind === "static") {
      try {
        await updateInstanceMutation({
          id: instance.value.id,
          input: {
            kind: "static",
            raw: rawContent.value,
            webhookIds: instance.value.webhookIds,
          },
        });
        isDirty.value = false;
        notify.success("Response body updated");
      } catch (e) {
        notify.error("Update failed", e);
      }
    }
  };

  const handleOpenBuilder = () => {
    if (instance.value.kind !== "static") {
      return;
    }
    router.push({
      name: "pocBuilder",
      params: { id: instance.value.id },
    });
  };

  const handleDelete = async () => {
    confirm.require({
      message: "Are you sure you want to delete this instance?",
      header: "Delete Confirmation",
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
      accept: async () => {
        try {
          await deleteInstanceMutation(instance.value.id);
          notify.success("Deleted");
          router.push("/");
        } catch (e) {
          notify.error("Delete failed", e);
        }
      },
    });
  };

  const handleClearLogs = async () => {
    confirm.require({
      message: "Are you sure you want to clear all logs for this instance?",
      header: "Clear Logs Confirmation",
      icon: "pi pi-exclamation-triangle",
      rejectProps: {
        label: "Cancel",
        severity: "secondary",
        outlined: true,
      },
      acceptProps: {
        label: "Clear",
        severity: "danger",
      },
      accept: async () => {
        try {
          await clearLogsMutation(instance.value.id);
          notify.success("Logs cleared");
        } catch (e) {
          notify.error("Failed to clear logs", e);
        }
      },
    });
  };

  const handleEditorChange = (value: string) => {
    rawContent.value = value;
    isDirty.value = true;
  };

  const triggerFileUpload = () => {
    fileInputRef.value?.click();
  };

  const handleFileUpload = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (isAbsent(file)) return;

    try {
      const { raw } = await processFile(file);
      rawContent.value = raw;
      isDirty.value = true;
    } catch (e) {
      notify.error("Failed to process file", e);
    } finally {
      target.value = "";
    }
  };

  const handleExtend = async () => {
    try {
      await extendInstanceMutation(instance.value.id);
      notify.success("Instance extended");
    } catch (e) {
      notify.error("Failed to extend instance", e);
    }
  };

  const startEditingLabel = () => {
    editLabel.value = instance.value.label ?? "";
    isEditingLabel.value = true;
  };

  const cancelEditingLabel = () => {
    isEditingLabel.value = false;
    editLabel.value = "";
  };

  const saveLabel = async () => {
    if (isSavingViaEnter.value) {
      return;
    }

    const newLabel = editLabel.value.trim();
    const currentLabel = instance.value.label ?? "";

    if (newLabel === currentLabel) {
      cancelEditingLabel();
      return;
    }

    try {
      await renameInstanceMutation({
        id: instance.value.id,
        input: { label: newLabel || undefined },
      });
      isEditingLabel.value = false;
      notify.success("Instance renamed");
    } catch (e) {
      notify.error("Failed to rename instance", e);
    }
  };

  const handleLabelKeydown = async (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      isSavingViaEnter.value = true;
      const newLabel = editLabel.value.trim();
      const currentLabel = instance.value.label ?? "";

      if (newLabel === currentLabel) {
        cancelEditingLabel();
        isSavingViaEnter.value = false;
        return;
      }

      try {
        await renameInstanceMutation({
          id: instance.value.id,
          input: { label: newLabel || undefined },
        });
        isEditingLabel.value = false;
        notify.success("Instance renamed");
      } catch (e) {
        notify.error("Failed to rename instance", e);
      } finally {
        setTimeout(() => {
          isSavingViaEnter.value = false;
        }, 100);
      }
    } else if (event.key === "Escape") {
      cancelEditingLabel();
    }
  };

  return {
    instanceHost,
    rawContent,
    isDirty,
    isUpdating,
    isDeleting,
    isClearingLogs,
    isExtending,
    fileInputRef,
    selectedWebhookIds,
    showExpirationNotice,
    expirationText,
    expirationExact,
    isGuest,
    displayName,
    isEditingLabel,
    editLabel,
    labelInputRef,
    handleCopy,
    handleSave,
    handleEditorChange,
    handleDelete,
    handleClearLogs,
    triggerFileUpload,
    handleFileUpload,
    handleExtend,
    handleOpenBuilder,
    startEditingLabel,
    saveLabel,
    handleLabelKeydown,
  };
};
