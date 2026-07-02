import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { storeToRefs } from "pinia";
import type { Instance, InstanceDetailResponse } from "shared";
import { guestInstancesApi } from "@/api/domains/guestInstances";
import { instancesApi } from "@/api/domains/instances";
import { NotFoundError } from "@/api/errors";
import { queryKeys } from "@/queries/keys";
import { useAuthStore } from "@/stores/auth";
import { useGuestInstancesStore } from "@/stores/guestInstances";

const INSTANCE_QUERY_SCOPE = new Set(["guest", "user"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCacheInstance = (value: unknown): value is Instance => {
  if (!isRecord(value) || typeof value.id !== "string") {
    return false;
  }

  if (value.kind === "static") {
    return typeof value.raw === "string";
  }

  if (value.kind === "dynamic") {
    return Array.isArray(value.processors);
  }

  return false;
};

const isCacheInstanceDetail = (
  value: unknown,
): value is InstanceDetailResponse =>
  isRecord(value) &&
  isCacheInstance(value.instance) &&
  Array.isArray(value.logs);

const isInstanceListQueryKey = (queryKey: readonly unknown[]) =>
  queryKey[0] === queryKeys.instances.all[0] &&
  INSTANCE_QUERY_SCOPE.has(String(queryKey[1]));

const isInstanceDetailQueryKey = (queryKey: readonly unknown[], id: string) =>
  queryKey[0] === queryKeys.instances.all[0] &&
  queryKey[1] === id &&
  INSTANCE_QUERY_SCOPE.has(String(queryKey[2]));

const getCachedInstanceDetail = (
  queryClient: QueryClient,
  id: string,
): InstanceDetailResponse | undefined => {
  const cachedQueries = queryClient.getQueriesData<unknown>({
    queryKey: queryKeys.instances.detail(id),
  });

  for (const [queryKey, detail] of cachedQueries) {
    if (
      isInstanceDetailQueryKey(queryKey, id) &&
      isCacheInstanceDetail(detail)
    ) {
      return detail;
    }
  }

  return undefined;
};

const findCachedInstance = (
  queryClient: QueryClient,
  id: string,
): Instance | undefined => {
  const listQueries = queryClient.getQueriesData<unknown>({
    queryKey: queryKeys.instances.all,
  });

  for (const [queryKey, instances] of listQueries) {
    if (!isInstanceListQueryKey(queryKey) || !Array.isArray(instances)) {
      continue;
    }

    for (const instance of instances) {
      if (isCacheInstance(instance) && instance.id === id) {
        return instance;
      }
    }
  }

  return undefined;
};

export const buildInstanceDetailPlaceholder = (
  queryClient: QueryClient,
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
