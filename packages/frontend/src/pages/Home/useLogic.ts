import type { Instance } from "shared";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useNotify } from "@/composables";
import { config } from "@/config";
import {
  useCreateInstance,
  useInstances,
} from "@/queries/domains/useInstances";
import { isAbsent } from "@/utils/types";

export const useHomeLogic = () => {
  const router = useRouter();
  const notify = useNotify();
  const searchQuery = ref("");

  const { data: instances, isLoading, error, refetch } = useInstances();

  const createMutation = useCreateInstance();

  const normalizedQuery = computed(() =>
    searchQuery.value.trim().toLowerCase(),
  );

  const filteredInstances = computed(() => {
    if (isAbsent(instances.value)) {
      return [];
    }

    const sortInstances = (list: Instance[]) =>
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

    const filtered = instances.value.filter((instance: Instance) => {
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
        kind: "static",
        raw: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\n\r\n{"message":"Hello from HTTP Workbench!","status":"success"}',
      },
      {
        onSuccess: (instance) => {
          notify.success(
            "Instance created",
            "Your instance has been created successfully",
          );
          void router.push(`/instances/${instance.id}`);
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
    handleRetry: () => {
      void refetch();
    },
  };
};
