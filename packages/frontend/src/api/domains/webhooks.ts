import type {
  CreateWebhookInput,
  TestWebhookInput,
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

  testWebhook: async (input: TestWebhookInput): Promise<void> => {
    return apiClient.post<void>("/api/webhooks/test", input);
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
