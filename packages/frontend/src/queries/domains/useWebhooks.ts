import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { CreateWebhookInput, UpdateWebhookInput } from "shared";
import { webhooksApi } from "@/api/domains/webhooks";
import { WEBHOOKS_QUERY_KEY } from "../keys";

type WebhooksOptions = {
  enabled?: MaybeRefOrGetter<boolean>;
};

export function useWebhooks(options?: WebhooksOptions) {
  return useQuery({
    queryKey: [WEBHOOKS_QUERY_KEY],
    queryFn: webhooksApi.fetchWebhooks,
    enabled: computed(() => toValue(options?.enabled ?? true)),
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWebhookInput) => webhooksApi.createWebhook(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [WEBHOOKS_QUERY_KEY] });
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWebhookInput }) =>
      webhooksApi.updateWebhook(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [WEBHOOKS_QUERY_KEY] });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => webhooksApi.deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [WEBHOOKS_QUERY_KEY] });
    },
  });
}
