import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type {
  CreateWebhookInput,
  TestWebhookInput,
  UpdateWebhookInput,
} from "shared";
import { webhooksApi } from "@/api/domains/webhooks";
import { queryKeys } from "../keys";

type WebhooksOptions = {
  enabled?: MaybeRefOrGetter<boolean>;
};

export function useWebhooks(options?: WebhooksOptions) {
  return useQuery({
    queryKey: queryKeys.webhooks.all,
    queryFn: webhooksApi.fetchWebhooks,
    enabled: computed(() => toValue(options?.enabled ?? true)),
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWebhookInput) => webhooksApi.createWebhook(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
    },
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (input: TestWebhookInput) => webhooksApi.testWebhook(input),
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWebhookInput }) =>
      webhooksApi.updateWebhook(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => webhooksApi.deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
    },
  });
}
