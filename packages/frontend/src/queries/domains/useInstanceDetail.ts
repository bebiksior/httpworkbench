import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { storeToRefs } from "pinia";
import type { Instance, InstanceDetailResponse, InstanceSummary } from "shared";
import { guestInstancesApi } from "@/api/domains/guestInstances";
import { instancesApi } from "@/api/domains/instances";
import { NotFoundError } from "@/api/errors";
import { queryKeys } from "@/queries/keys";
import { useAuthStore } from "@/stores/auth";
import { useGuestInstancesStore } from "@/stores/guestInstances";

const INSTANCE_QUERY_SCOPE = new Set(["guest", "user"]);
const INSTANCE_DETAIL_STALE_TIME_MS = 10_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCacheInstance = (
  value: unknown,
): value is InstanceDetailResponse["instance"] => {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.raw === "string"
  );
};

const isCacheInstanceDetail = (
  value: unknown,
): value is InstanceDetailResponse =>
  isRecord(value) &&
  isCacheInstance(value.instance) &&
  Array.isArray(value.logs);

const isInstanceDetailQueryKey = (queryKey: readonly unknown[], id: string) =>
  queryKey[0] === queryKeys.instances.all[0] &&
  queryKey[1] === id &&
  INSTANCE_QUERY_SCOPE.has(String(queryKey[2]));

const isInstanceListQueryKey = (queryKey: readonly unknown[]) =>
  queryKey[0] === queryKeys.instances.all[0] &&
  (queryKey[1] === "guest" || queryKey[1] === "user");

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

const getCachedInstanceSummary = (
  queryClient: QueryClient,
  id: string,
): InstanceSummary | undefined => {
  const cachedQueries = queryClient.getQueriesData<InstanceSummary[]>({
    queryKey: queryKeys.instances.all,
  });

  for (const [queryKey, instances] of cachedQueries) {
    if (!isInstanceListQueryKey(queryKey) || instances === undefined) {
      continue;
    }
    const instance = instances.find((candidate) => candidate.id === id);
    if (instance !== undefined) {
      return instance;
    }
  }

  return undefined;
};

const buildInstanceFromSummary = (summary: InstanceSummary): Instance => ({
  id: summary.id,
  ownerId: summary.ownerId,
  createdAt: summary.createdAt,
  expiresAt: summary.expiresAt,
  label: summary.label,
  public: summary.public,
  locked: summary.locked,
  raw: "",
  webhookIds: [],
});

export const buildInstanceDetailPlaceholder = (
  queryClient: QueryClient,
  id: string,
): InstanceDetailResponse | undefined => {
  const cachedDetail = getCachedInstanceDetail(queryClient, id);
  if (cachedDetail !== undefined) {
    return cachedDetail;
  }
  const summary = getCachedInstanceSummary(queryClient, id);
  if (summary === undefined) {
    return undefined;
  }
  return {
    instance: buildInstanceFromSummary(summary),
    logs: [],
  };
};

export const selectInstanceDetailPlaceholder = (
  queryClient: QueryClient,
  id: string,
  previousData: InstanceDetailResponse | undefined,
) =>
  previousData?.instance.id === id
    ? previousData
    : buildInstanceDetailPlaceholder(queryClient, id);

const useInstanceDetailRequest = () => {
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);
  const { ids } = storeToRefs(guestInstancesStore);

  const getQueryKey = (id: string) => [
    ...queryKeys.instances.detail(id),
    isGuest.value ? "guest" : "user",
    ids.value.join(","),
  ];

  const fetchInstanceDetail = async (id: string) => {
    const useGuestApi = isGuest.value && ids.value.includes(id);
    try {
      if (useGuestApi) {
        const token = guestInstancesStore.getToken(id);
        if (token === undefined) {
          guestInstancesStore.forgetInstance(id);
          throw new NotFoundError("Guest instance credentials are missing");
        }
        return await guestInstancesApi.getById(id, token);
      }
      return await instancesApi.getById(id);
    } catch (error) {
      if (useGuestApi && error instanceof NotFoundError) {
        guestInstancesStore.forgetInstance(id);
      }
      throw error;
    }
  };

  return { getQueryKey, fetchInstanceDetail };
};

export const usePrefetchInstanceDetail = () => {
  const queryClient = useQueryClient();
  const request = useInstanceDetailRequest();

  return (id: string) =>
    queryClient.prefetchQuery({
      queryKey: request.getQueryKey(id),
      queryFn: () => request.fetchInstanceDetail(id),
      retry: false,
      staleTime: INSTANCE_DETAIL_STALE_TIME_MS,
    });
};

export const useInstanceDetail = (instanceId: MaybeRefOrGetter<string>) => {
  const queryClient = useQueryClient();
  const request = useInstanceDetailRequest();

  return useQuery({
    queryKey: computed(() => request.getQueryKey(toValue(instanceId))),
    queryFn: () => request.fetchInstanceDetail(toValue(instanceId)),
    retry: false,
    staleTime: INSTANCE_DETAIL_STALE_TIME_MS,
    placeholderData: (previousData) =>
      selectInstanceDetailPlaceholder(
        queryClient,
        toValue(instanceId),
        previousData,
      ),
  });
};
