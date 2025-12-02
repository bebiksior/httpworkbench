import type { Instance } from "shared";
import { computed, ref } from "vue";
import { useNotify } from "@/composables";
import { config } from "@/config";
import {
  useCreateInstance,
  useInstances,
} from "@/queries/domains/useInstances";
import { isAbsent } from "@/utils/types";

export const useHomeLogic = () => {
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

    if (normalizedQuery.value === "") {
      return instances.value;
    }

    return instances.value.filter((instance: Instance) => {
      const instanceId = instance.id.toLowerCase();
      const host = config.getInstanceHost(instance.id).toLowerCase();
      return (
        instanceId.includes(normalizedQuery.value) ||
        host.includes(normalizedQuery.value)
      );
    });
  });

  const handleCreateInstance = () => {
    createMutation.mutate(
      {
        kind: "static",
        raw: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\n\r\n{"message":"Hello from HTTP Workbench!","status":"success"}',
      },
      {
        onSuccess: () => {
          notify.success(
            "Instance created",
            "Your instance has been created successfully",
          );
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
