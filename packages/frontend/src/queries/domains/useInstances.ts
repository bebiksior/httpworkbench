import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import type {
  CreateInstanceInput,
  Instance,
  RenameInstanceInput,
  SetInstanceLockedInput,
  UpdateInstanceInput,
} from "shared";
import { guestInstancesApi } from "@/api/domains/guestInstances";
import { instancesApi } from "@/api/domains/instances";
import { ForbiddenError, NotFoundError } from "@/api/errors";
import { queryKeys } from "@/queries/keys";
import { useAuthStore, useGuestInstancesStore } from "@/stores";

export const useInstances = () => {
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);
  const { ids } = storeToRefs(guestInstancesStore);

  const guestKey = computed(() =>
    isGuest.value ? ids.value.join(",") : undefined,
  );

  const fetchGuestInstances = async () => {
    guestInstancesStore.cleanupExpired();
    const tracked = [...ids.value];
    if (tracked.length === 0) {
      return [];
    }

    const instances: Instance[] = [];
    const missing: string[] = [];

    for (const id of tracked) {
      try {
        const detail = await guestInstancesApi.getById(id);
        instances.push(detail.instance);
      } catch (error) {
        if (error instanceof NotFoundError) {
          missing.push(id);
          continue;
        }
        throw error;
      }
    }

    if (missing.length > 0) {
      missing.forEach((id) => guestInstancesStore.forgetInstance(id));
    }

    return instances;
  };

  return useQuery({
    queryKey: computed(() => {
      if (isGuest.value) {
        return [...queryKeys.instances.all, "guest", guestKey.value];
      }
      return [...queryKeys.instances.all, "user"];
    }),
    queryFn: async () => {
      if (isGuest.value) {
        return fetchGuestInstances();
      }
      return instancesApi.getAll();
    },
  });
};

export const useCreateInstance = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: (input: CreateInstanceInput) => {
      if (isGuest.value) {
        return guestInstancesApi.create(input);
      }
      return instancesApi.create(input);
    },
    onSuccess: (instance) => {
      if (isGuest.value) {
        guestInstancesStore.trackInstance(instance.id);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.instances.all });
    },
  });
};

export const useUpdateInstance = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInstanceInput }) => {
      if (isGuest.value) {
        return guestInstancesApi.update(id, input);
      }
      return instancesApi.update(id, input);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instances.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.instances.detail(data.id),
      });
    },
  });
};

export const useDeleteInstance = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: (id: string) => {
      if (isGuest.value) {
        return guestInstancesApi.delete(id);
      }
      return instancesApi.delete(id);
    },
    onSuccess: (_, id) => {
      if (isGuest.value) {
        guestInstancesStore.forgetInstance(id);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.instances.all });
    },
  });
};

export const useClearLogs = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: (id: string) => {
      if (isGuest.value) {
        return guestInstancesApi.clearLogs(id);
      }
      return instancesApi.clearLogs(id);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.instances.detail(id),
      });
    },
  });
};

export const useExtendInstance = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: async (id: string) => {
      if (isGuest.value) {
        throw new ForbiddenError("Guest instances cannot be extended");
      }
      return instancesApi.extend(id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instances.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.instances.detail(data.id),
      });
    },
  });
};

export const useRenameInstance = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: RenameInstanceInput;
    }) => {
      if (isGuest.value) {
        throw new ForbiddenError("Guest instances cannot be renamed");
      }
      return instancesApi.rename(id, input);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instances.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.instances.detail(data.id),
      });
    },
  });
};

export const useSetInstanceLocked = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: async ({ id, locked }: { id: string; locked: boolean }) => {
      const input: SetInstanceLockedInput = { locked };
      if (isGuest.value) {
        return guestInstancesApi.setLocked(id, input);
      }
      return instancesApi.setLocked(id, input);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instances.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.instances.detail(data.id),
      });
    },
  });
};
