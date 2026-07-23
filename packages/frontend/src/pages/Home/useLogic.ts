import type { InstanceSummary } from "shared";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useNotify } from "@/composables";
import { config } from "@/config";
import {
  useCreateInstance,
  useInstances,
} from "@/queries/domains/useInstances";
import { isAbsent } from "@/utils/types";
import { DEFAULT_HTTP_RESPONSE } from "@/utils/httpResponse";

const INSTANCE_LIST_REFETCH_INTERVAL_MS = 5_000;

export const useHomeLogic = () => {
  const router = useRouter();
  const notify = useNotify();
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

  return {
    searchQuery,
    instances,
    filteredInstances,
    isLoading,
    error,
    handleCreateInstance,
    isCreating: computed(() => createMutation.isPending.value),
    handleRetry: async () => {
      await refetch();
    },
  };
};
