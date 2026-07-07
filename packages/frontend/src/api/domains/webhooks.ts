import type {
  CreateWebhookInput,
  TestWebhookInput,
  UpdateWebhookInput,
  Webhook,
  WebhooksResponse,
} from "shared";
import { apiClient } from "../client";
import { apiPaths } from "../paths";

export const webhooksApi = {
  fetchWebhooks: async (): Promise<WebhooksResponse> => {
    return apiClient.get<WebhooksResponse>(apiPaths.webhooks);
  },

  createWebhook: async (input: CreateWebhookInput): Promise<Webhook> => {
    return apiClient.post<Webhook>(apiPaths.webhooks, input);
  },

  testWebhook: async (input: TestWebhookInput): Promise<void> => {
    return apiClient.post<void>(apiPaths.webhookTest, input);
  },

  updateWebhook: async (
    id: string,
    input: UpdateWebhookInput,
  ): Promise<Webhook> => {
    return apiClient.patch<Webhook>(apiPaths.webhook(id), input);
  },

  deleteWebhook: async (id: string): Promise<void> => {
    return apiClient.delete<void>(apiPaths.webhook(id));
  },
};
