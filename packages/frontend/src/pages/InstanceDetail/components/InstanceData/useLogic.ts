import { useConfirm } from "primevue/useconfirm";
import { GUEST_OWNER_ID, type Instance } from "shared";
import { computed, ref, type Ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useTimeAgo } from "@vueuse/core";
import dayjs from "dayjs";
import { useNotify } from "@/composables";
import { config } from "@/config";
import {
  useClearLogs,
  useCloneInstance,
  useDeleteInstance,
  useExtendInstance,
  useRenameInstance,
  useSetInstanceLocked,
  useSetInstancePublic,
} from "@/queries/domains/useInstances";
import { useAuthStore } from "@/stores/auth";
import { useGuestInstancesStore } from "@/stores/guestInstances";
import { isAbsent, isPresent } from "@/utils/types";
import { useInstanceEditor } from "./useInstanceEditor";

export const useInstanceDataLogic = (instance: Ref<Instance>) => {
  const notify = useNotify();
  const confirm = useConfirm();
  const router = useRouter();
  const { mutateAsync: deleteInstanceMutation, isPending: isDeleting } =
    useDeleteInstance();
  const { mutateAsync: cloneInstanceMutation, isPending: isCloning } =
    useCloneInstance();
  const { mutateAsync: clearLogsMutation, isPending: isClearingLogs } =
    useClearLogs();
  const { mutateAsync: extendInstanceMutation, isPending: isExtending } =
    useExtendInstance();
  const { mutateAsync: renameInstanceMutation } = useRenameInstance();
  const { mutateAsync: setInstanceLockedMutation, isPending: isSettingLocked } =
    useSetInstanceLocked();
  const { mutateAsync: setInstancePublicMutation, isPending: isSettingPublic } =
    useSetInstancePublic();

  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);
  const { ids: guestInstanceIds } = storeToRefs(guestInstancesStore);

  const instanceHost = computed(() =>
    config.getInstanceHost(instance.value.id),
  );
  const isLocked = computed(() => instance.value.locked);
  const isPublic = computed(() => instance.value.public);
  const canManageInstance = computed(() => {
    if (instance.value.ownerId === GUEST_OWNER_ID) {
      return (
        isGuest.value && guestInstanceIds.value.includes(instance.value.id)
      );
    }

    if (isGuest.value) {
      return false;
    }

    return authStore.user?.id === instance.value.ownerId;
  });

  const isEditingLabel = ref(false);
  const editLabel = ref("");
  const labelInputRef = ref<HTMLInputElement | null>(null);
  const isSavingLabel = ref(false);

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
  const editor = useInstanceEditor(instance, canManageInstance);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(instanceHost.value);
    notify.copied();
  };

  const handleOpenBuilder = () => {
    if (!canManageInstance.value) {
      return;
    }
    router.push({
      name: "pocBuilder",
      params: { id: instance.value.id },
    });
  };

  const handleDelete = async () => {
    if (!canManageInstance.value) {
      return;
    }

    if (isLocked.value) {
      notify.error("Instance is locked");
      return;
    }
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

  const handleClone = async () => {
    if (!canManageInstance.value) {
      return;
    }

    try {
      const cloned = await cloneInstanceMutation(instance.value);
      notify.success("Instance cloned");
      await router.push({
        name: "instanceDetail",
        params: { id: cloned.id },
      });
    } catch (e) {
      notify.error("Failed to clone instance", e);
    }
  };

  const handleToggleLock = async () => {
    if (!canManageInstance.value) {
      return;
    }

    const nextLocked = !isLocked.value;
    try {
      await setInstanceLockedMutation({
        id: instance.value.id,
        locked: nextLocked,
      });
      notify.success(nextLocked ? "Instance locked" : "Instance unlocked");
    } catch (e) {
      notify.error("Failed to update lock", e);
    }
  };

  const handleClearLogs = async () => {
    if (!canManageInstance.value) {
      return;
    }

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

  const handleExtend = async () => {
    if (!canManageInstance.value) {
      return;
    }

    try {
      await extendInstanceMutation(instance.value.id);
      notify.success("Instance extended");
    } catch (e) {
      notify.error("Failed to extend instance", e);
    }
  };

  const startEditingLabel = () => {
    if (!canManageInstance.value) {
      return;
    }

    editLabel.value = instance.value.label ?? "";
    isEditingLabel.value = true;
  };

  const cancelEditingLabel = () => {
    isEditingLabel.value = false;
    editLabel.value = "";
  };

  const saveLabel = async () => {
    if (isSavingLabel.value || !isEditingLabel.value) {
      return;
    }

    const newLabel = editLabel.value.trim();
    const currentLabel = instance.value.label ?? "";

    if (newLabel === currentLabel) {
      cancelEditingLabel();
      return;
    }

    isSavingLabel.value = true;
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
      isSavingLabel.value = false;
    }
  };

  const handleLabelKeydown = async (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await saveLabel();
    } else if (event.key === "Escape") {
      cancelEditingLabel();
    }
  };

  const handleTogglePublic = async () => {
    if (!canManageInstance.value) {
      return;
    }

    const nextPublic = !isPublic.value;
    try {
      await setInstancePublicMutation({
        id: instance.value.id,
        isPublic: nextPublic,
      });
      notify.success(
        nextPublic ? "Instance is now public" : "Instance is now private",
      );
    } catch (e) {
      notify.error("Failed to update visibility", e);
    }
  };

  return {
    instanceHost,
    ...editor,
    isCloning,
    isDeleting,
    isClearingLogs,
    isExtending,
    isLocked,
    isPublic,
    isSettingLocked,
    isSettingPublic,
    canManageInstance,
    showExpirationNotice,
    expirationText,
    expirationExact,
    isGuest,
    displayName,
    isEditingLabel,
    editLabel,
    labelInputRef,
    handleCopy,
    handleDelete,
    handleClone,
    handleClearLogs,
    handleToggleLock,
    handleTogglePublic,
    handleExtend,
    handleOpenBuilder,
    startEditingLabel,
    saveLabel,
    handleLabelKeydown,
  };
};
