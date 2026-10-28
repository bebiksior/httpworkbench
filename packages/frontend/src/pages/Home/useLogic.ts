import type { InstanceSummary } from "shared";
import { useConfirm } from "primevue/useconfirm";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useNotify } from "@/composables";
import { config } from "@/config";
import { loadInstanceDetailPage } from "@/pages/InstanceDetail/load";
import {
  useCreateInstance,
  useDeleteAllInstances,
  useInstances,
} from "@/queries/domains/useInstances";
import { isAbsent } from "@/utils/types";
import { DEFAULT_HTTP_RESPONSE } from "@/utils/httpResponse";

const INSTANCE_LIST_REFETCH_INTERVAL_MS = 5_000;

const pluralizeInstances = (count: number, adjective?: string) =>
  [count, adjective, count === 1 ? "instance" : "instances"]
    .filter((part) => part !== undefined)
    .join(" ");

export const useHomeLogic = () => {
  const router = useRouter();
  const notify = useNotify();
  const confirm = useConfirm();
  const searchQuery = ref("");

  const {
    data: instances,
    isLoading,
    error,
    refetch,
  } = useInstances({
    refetchInterval: INSTANCE_LIST_REFETCH_INTERVAL_MS,
  });

  const createMutation = useCreateInstance();
  const deleteAllMutation = useDeleteAllInstances();
  let idleCallbackId: number | undefined;
  let preloadTimeoutId: number | undefined;

  onMounted(() => {
    if (typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(
        () => void loadInstanceDetailPage(),
        { timeout: 2_000 },
      );
      return;
    }
    preloadTimeoutId = setTimeout(() => void loadInstanceDetailPage(), 0);
  });

  onBeforeUnmount(() => {
    if (idleCallbackId !== undefined) {
      window.cancelIdleCallback(idleCallbackId);
    }
    if (preloadTimeoutId !== undefined) {
      clearTimeout(preloadTimeoutId);
    }
  });

  const normalizedQuery = computed(() =>
    searchQuery.value.trim().toLowerCase(),
  );

  const filteredInstances = computed(() => {
    if (isAbsent(instances.value)) {
      return [];
    }

    const sortInstances = (list: InstanceSummary[]) =>
      [...list].sort((a, b) => {
        const lockedDiff = Number(a.locked) - Number(b.locked);
        if (lockedDiff !== 0) return lockedDiff;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

    if (normalizedQuery.value === "") {
      return sortInstances(instances.value);
    }

    const filtered = instances.value.filter((instance: InstanceSummary) => {
      const instanceId = instance.id.toLowerCase();
      const host = config.getInstanceHost(instance.id).toLowerCase();
      const label = instance.label?.toLowerCase() ?? "";
      return (
        instanceId.includes(normalizedQuery.value) ||
        host.includes(normalizedQuery.value) ||
        label.includes(normalizedQuery.value)
      );
    });

    return sortInstances(filtered);
  });

  const handleCreateInstance = () => {
    createMutation.mutate(
      {
        raw: DEFAULT_HTTP_RESPONSE,
      },
      {
        onSuccess: async (instance) => {
          notify.success(
            "Instance created",
            "Your instance has been created successfully",
          );
          await router.push(`/instances/${instance.id}`);
        },
        onError: (err: Error) => {
          notify.error("Failed to create instance", err);
        },
      },
    );
  };

  const unlockedInstanceIds = computed(() =>
    (instances.value ?? [])
      .filter((instance) => !instance.locked)
      .map((instance) => instance.id),
  );
  const lockedInstanceCount = computed(
    () => (instances.value?.length ?? 0) - unlockedInstanceIds.value.length,
  );

  const handleDeleteAll = () => {
    const ids = unlockedInstanceIds.value;
    if (ids.length === 0) {
      return;
    }
    const lockedNote =
      lockedInstanceCount.value > 0
        ? ` ${pluralizeInstances(lockedInstanceCount.value, "locked")} will be kept.`
        : "";
    confirm.require({
      message: `Delete ${pluralizeInstances(ids.length)}? This cannot be undone.${lockedNote}`,
      header: "Delete All Instances",
      icon: "pi pi-exclamation-triangle",
      rejectProps: {
        label: "Cancel",
        severity: "secondary",
        outlined: true,
      },
      acceptProps: {
        label: `Delete ${ids.length}`,
        severity: "danger",
      },
      accept: () => {
        deleteAllMutation.mutate([...ids], {
          onSuccess: (deleted) => {
            notify.success(`Deleted ${pluralizeInstances(deleted)}`);
          },
          onError: (err: Error) => {
            notify.error("Failed to delete instances", err);
          },
        });
      },
    });
  };

  return {
    searchQuery,
    instances,
    filteredInstances,
    isLoading,
    error,
    handleCreateInstance,
    isCreating: computed(() => createMutation.isPending.value),
    canDeleteAll: computed(() => unlockedInstanceIds.value.length > 0),
    handleDeleteAll,
    isDeletingAll: computed(() => deleteAllMutation.isPending.value),
    handleRetry: async () => {
      await refetch();
    },
  };
};
