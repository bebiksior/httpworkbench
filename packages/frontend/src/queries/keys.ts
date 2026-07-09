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

export const invalidateInstanceQueries = async (
  queryClient: QueryClient,
  id?: string,
) => {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: queryKeys.instances.all }),
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
