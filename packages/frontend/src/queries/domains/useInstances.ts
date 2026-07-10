import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { storeToRefs } from "pinia";
import type {
  CreateInstanceInput,
  Instance,
  InstanceDetailResponse,
  InstanceSummary,
  RenameInstanceInput,
  SetInstanceLockedInput,
  SetInstancePublicInput,
  UpdateInstanceInput,
} from "shared";
import { guestInstancesApi } from "@/api/domains/guestInstances";
import { instancesApi } from "@/api/domains/instances";
import { ForbiddenError } from "@/api/errors";
import {
  instanceListQueryKey,
  invalidateInstanceQueries,
  queryKeys,
} from "@/queries/keys";
import { useAuthStore } from "@/stores/auth";
import { useGuestInstancesStore } from "@/stores/guestInstances";
import type { GuestInstanceRecord } from "@/stores/guestInstances.utils";

type InstancesOptions = {
  enabled?: MaybeRefOrGetter<boolean>;
};

const GUEST_SUMMARY_BATCH_SIZE = 100;

export const loadGuestInstanceSummaries = async (
  records: readonly GuestInstanceRecord[],
  loadBatch = guestInstancesApi.getSummaries,
) => {
  const batches: GuestInstanceRecord[][] = [];
  for (
    let index = 0;
    index < records.length;
    index += GUEST_SUMMARY_BATCH_SIZE
  ) {
    batches.push(records.slice(index, index + GUEST_SUMMARY_BATCH_SIZE));
  }
  const pages: InstanceSummary[][] = [];
  for (const batch of batches) {
    pages.push(
      await loadBatch({
        instances: batch.map(({ id, token }) => ({ id, token })),
      }),
    );
  }
  return pages.flat();
};

const requireGuestToken = (
  getToken: (id: string) => string | undefined,
  id: string,
) => {
  const token = getToken(id);
  if (token === undefined) {
    throw new ForbiddenError("Guest instance credentials are missing");
  }
  return token;
};

export const useInstances = (options?: InstancesOptions) => {
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);
  const { ids, records } = storeToRefs(guestInstancesStore);

  const guestKey = computed(() =>
    isGuest.value ? ids.value.join(",") : undefined,
  );

  const fetchGuestInstances = async () => {
    guestInstancesStore.cleanupExpired();
    const tracked = [...records.value];
    if (tracked.length === 0) {
      return [];
    }

    const instances = await loadGuestInstanceSummaries(tracked);
    const foundIds = new Set(instances.map((instance) => instance.id));
    const missing = tracked
      .map(({ id }) => id)
      .filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      missing.forEach((id) => guestInstancesStore.forgetInstance(id));
    }

    return instances;
  };

  return useQuery({
    queryKey: computed(() =>
      instanceListQueryKey(isGuest.value, guestKey.value),
    ),
    queryFn: async () => {
      if (isGuest.value) {
        return fetchGuestInstances();
      }
      return instancesApi.getAll();
    },
    enabled: computed(() => toValue(options?.enabled ?? true)),
  });
};

export const useCreateInstance = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: async (input: CreateInstanceInput) => {
      if (isGuest.value) {
        const created = await guestInstancesApi.create(input);
        guestInstancesStore.trackInstance(created.instance.id, created.token);
        return created.instance;
      }
      return instancesApi.create(input);
    },
    onSuccess: async () => {
      await invalidateInstanceQueries(queryClient);
    },
  });
};

const getCloneLabel = (label: string) => {
  const suffix = " (copy)";
  const trimmed = label.trim();
  if (trimmed === "") {
    return undefined;
  }

  const maxBaseLength = 100 - suffix.length;
  if (trimmed.length <= maxBaseLength) {
    return `${trimmed}${suffix}`;
  }

  return `${trimmed.slice(0, maxBaseLength)}${suffix}`;
};

export const useCloneInstance = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: async (source: Instance | InstanceSummary) => {
      const instance =
        "raw" in source
          ? source
          : (
              await (isGuest.value
                ? guestInstancesApi.getById(
                    source.id,
                    requireGuestToken(guestInstancesStore.getToken, source.id),
                  )
                : instancesApi.getById(source.id))
            ).instance;
      const input: CreateInstanceInput = {
        raw: instance.raw,
        webhookIds: isGuest.value ? undefined : instance.webhookIds,
      };

      if (isGuest.value) {
        const created = await guestInstancesApi.create(input);
        guestInstancesStore.trackInstance(created.instance.id, created.token);
        return created.instance;
      }

      const created = await instancesApi.create(input);

      const clonedLabel =
        instance.label === undefined
          ? undefined
          : getCloneLabel(instance.label);
      if (clonedLabel === undefined) {
        return created;
      }

      return instancesApi.rename(created.id, { label: clonedLabel });
    },
    onSuccess: async (instance) => {
      await invalidateInstanceQueries(queryClient, instance.id);
    },
  });
};

export const useUpdateInstance = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInstanceInput }) => {
      if (isGuest.value) {
        return guestInstancesApi.update(
          id,
          requireGuestToken(guestInstancesStore.getToken, id),
          input,
        );
      }
      return instancesApi.update(id, input);
    },
    onSuccess: async (data) => {
      await invalidateInstanceQueries(queryClient, data.id);
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
        return guestInstancesApi.delete(
          id,
          requireGuestToken(guestInstancesStore.getToken, id),
        );
      }
      return instancesApi.delete(id);
    },
    onSuccess: async (_, id) => {
      if (isGuest.value) {
        guestInstancesStore.forgetInstance(id);
      }
      await invalidateInstanceQueries(queryClient);
    },
  });
};

export const useClearLogs = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    onMutate: async (id) => {
      const queryKey = queryKeys.instances.detail(id);
      await queryClient.cancelQueries({ queryKey });
      const previousDetails =
        queryClient.getQueriesData<InstanceDetailResponse>({ queryKey });
      queryClient.setQueriesData<InstanceDetailResponse>(
        { queryKey },
        (detail) => {
          if (detail === undefined) {
            return undefined;
          }
          return { ...detail, logs: [], olderLogsCursor: undefined };
        },
      );
      return { previousDetails };
    },
    mutationFn: (id: string) => {
      if (isGuest.value) {
        return guestInstancesApi.clearLogs(
          id,
          requireGuestToken(guestInstancesStore.getToken, id),
        );
      }
      return instancesApi.clearLogs(id);
    },
    onError: (_error, _id, context) => {
      for (const [queryKey, detail] of context?.previousDetails ?? []) {
        queryClient.setQueryData(queryKey, detail);
      }
    },
    onSettled: (_data, _error, id) =>
      invalidateInstanceQueries(queryClient, id),
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
    onSuccess: async (data) => {
      await invalidateInstanceQueries(queryClient, data.id);
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
    onSuccess: async (data) => {
      await invalidateInstanceQueries(queryClient, data.id);
    },
  });
};

export const useSetInstanceLocked = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: async ({ id, locked }: { id: string; locked: boolean }) => {
      const input: SetInstanceLockedInput = { locked };
      if (isGuest.value) {
        return guestInstancesApi.setLocked(
          id,
          requireGuestToken(guestInstancesStore.getToken, id),
          input,
        );
      }
      return instancesApi.setLocked(id, input);
    },
    onSuccess: async (data) => {
      await invalidateInstanceQueries(queryClient, data.id);
    },
  });
};

export const useSetInstancePublic = () => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const { isGuest } = storeToRefs(authStore);

  return useMutation({
    mutationFn: async ({ id, isPublic }: { id: string; isPublic: boolean }) => {
      const input: SetInstancePublicInput = { public: isPublic };
      if (isGuest.value) {
        throw new ForbiddenError("Guest instances cannot change visibility");
      }
      return instancesApi.setPublic(id, input);
    },
    onSuccess: async (data) => {
      await invalidateInstanceQueries(queryClient, data.id);
    },
  });
};
