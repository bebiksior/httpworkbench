import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { CreateApiKeyInput } from "shared";
import { apiKeysApi } from "@/api/domains/apiKeys";
import { API_KEYS_QUERY_KEY } from "../keys";

type ApiKeysOptions = {
  enabled?: MaybeRefOrGetter<boolean>;
};

export function useApiKeys(options?: ApiKeysOptions) {
  return useQuery({
    queryKey: [API_KEYS_QUERY_KEY],
    queryFn: apiKeysApi.fetchApiKeys,
    enabled: computed(() => toValue(options?.enabled ?? true)),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateApiKeyInput) => apiKeysApi.createApiKey(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [API_KEYS_QUERY_KEY] });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiKeysApi.revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [API_KEYS_QUERY_KEY] });
    },
  });
}
