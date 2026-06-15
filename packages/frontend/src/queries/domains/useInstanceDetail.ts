import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { storeToRefs } from "pinia";
import type { Instance, InstanceDetailResponse } from "shared";
import { guestInstancesApi } from "@/api/domains/guestInstances";
import { instancesApi } from "@/api/domains/instances";
import { NotFoundError } from "@/api/errors";
import { queryKeys } from "@/queries/keys";
import { useAuthStore } from "@/stores/auth";
import { useGuestInstancesStore } from "@/stores/guestInstances";

const getCachedInstanceDetail = (
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): InstanceDetailResponse | undefined => {
  const cachedQueries = queryClient.getQueriesData<InstanceDetailResponse>({
    queryKey: queryKeys.instances.detail(id),
  });

  for (const [, detail] of cachedQueries) {
    if (detail !== undefined) {
      return detail;
    }
  }

  return undefined;
};

const findCachedInstance = (
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): Instance | undefined => {
  const listQueries = queryClient.getQueriesData<Instance[]>({
    queryKey: queryKeys.instances.all,
  });

  for (const [, instances] of listQueries) {
    const match = instances?.find((instance) => instance.id === id);
    if (match !== undefined) {
      return match;
    }
  }

  return undefined;
};

const buildInstanceDetailPlaceholder = (
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): InstanceDetailResponse | undefined => {
  const cachedDetail = getCachedInstanceDetail(queryClient, id);
  if (cachedDetail !== undefined) {
    return cachedDetail;
  }

  const cachedInstance = findCachedInstance(queryClient, id);
  if (cachedInstance === undefined) {
    return undefined;
  }

  return {
    instance: cachedInstance,
    logs: [],
  };
};

export const useInstanceDetail = (instanceId: MaybeRefOrGetter<string>) => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);
  const { ids } = storeToRefs(guestInstancesStore);

  return useQuery({
    queryKey: computed(() => [
      ...queryKeys.instances.detail(toValue(instanceId)),
      isGuest.value ? "guest" : "user",
      ids.value.join(","),
    ]),
    queryFn: async () => {
      const id = toValue(instanceId);
      const useGuestApi = isGuest.value && ids.value.includes(id);
      try {
        if (useGuestApi) {
          return await guestInstancesApi.getById(id);
        }
        return await instancesApi.getById(id);
      } catch (error) {
        if (useGuestApi && error instanceof NotFoundError) {
          guestInstancesStore.forgetInstance(id);
        }
        throw error;
      }
    },
    retry: false,
    placeholderData: (previousData) => {
      if (previousData !== undefined) {
        return previousData;
      }

      return buildInstanceDetailPlaceholder(queryClient, toValue(instanceId));
    },
  });
};
