import type { QueryClient } from "@tanstack/vue-query";

export const queryKeys = {
  instances: {
    all: ["instances"] as const,
    detail: (id: string) => ["instances", id] as const,
    logs: (id: string) => ["instances", id, "logs"] as const,
  },
  auth: {
    user: ["auth", "user"] as const,
  },
  webhooks: {
    all: ["webhooks"] as const,
  },
  apiKeys: {
    all: ["api-keys"] as const,
  },
} as const;

export const instanceListQueryKey = (isGuest: boolean, guestKey?: string) =>
  isGuest
    ? ([...queryKeys.instances.all, "guest", guestKey] as const)
    : ([...queryKeys.instances.all, "user"] as const);

export const invalidateInstanceQueries = async (
  queryClient: QueryClient,
  id?: string,
) => {
  const invalidations = [
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return (
          key[0] === queryKeys.instances.all[0] &&
          (key[1] === "guest" || key[1] === "user")
        );
      },
    }),
  ];
  if (id !== undefined) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.instances.detail(id),
      }),
    );
  }
  await Promise.all(invalidations);
};
