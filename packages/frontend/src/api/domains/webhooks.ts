import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  Webhook,
  WebhooksResponse,
} from "shared";
import { apiClient } from "../client";

export const webhooksApi = {
  fetchWebhooks: async (): Promise<WebhooksResponse> => {
    return apiClient.get<WebhooksResponse>("/api/webhooks");
  },

  createWebhook: async (input: CreateWebhookInput): Promise<Webhook> => {
    return apiClient.post<Webhook>("/api/webhooks", input);
  },

  updateWebhook: async (
    id: string,
    input: UpdateWebhookInput,
  ): Promise<Webhook> => {
    return apiClient.patch<Webhook>(`/api/webhooks/${id}`, input);
  },

  deleteWebhook: async (id: string): Promise<void> => {
    return apiClient.delete<void>(`/api/webhooks/${id}`);
  },
};
