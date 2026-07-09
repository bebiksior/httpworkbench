import type {
  CreateWebhookInput,
  TestWebhookInput,
  UpdateWebhookInput,
  Webhook,
  WebhooksResponse,
} from "shared";
import {
  CreateWebhookSchema,
  TestWebhookSchema,
  UpdateWebhookSchema,
  WebhookSchema,
  WebhooksResponseSchema,
} from "shared";
import { apiClient } from "../client";
import { parseResponse } from "../parseResponse";
import { apiPaths } from "../paths";

export const webhooksApi = {
  fetchWebhooks: async (): Promise<WebhooksResponse> => {
    const data = await apiClient.get<unknown>(apiPaths.webhooks);
    return parseResponse(WebhooksResponseSchema, data, "webhooks");
  },

  createWebhook: async (input: CreateWebhookInput): Promise<Webhook> => {
    const data = await apiClient.post<unknown>(
      apiPaths.webhooks,
      CreateWebhookSchema.parse(input),
    );
    return parseResponse(WebhookSchema, data, "create webhook");
  },

  testWebhook: async (input: TestWebhookInput): Promise<void> => {
    return apiClient.post<void>(
      apiPaths.webhookTest,
      TestWebhookSchema.parse(input),
    );
  },

  updateWebhook: async (
    id: string,
    input: UpdateWebhookInput,
  ): Promise<Webhook> => {
    const data = await apiClient.patch<unknown>(
      apiPaths.webhook(id),
      UpdateWebhookSchema.parse(input),
    );
    return parseResponse(WebhookSchema, data, "update webhook");
  },

  deleteWebhook: async (id: string): Promise<void> => {
    return apiClient.delete<void>(apiPaths.webhook(id));
  },
};
