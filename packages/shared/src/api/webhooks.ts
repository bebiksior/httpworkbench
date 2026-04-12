import { z } from "zod";
import { WebhookMessageSchema, WebhookSchema } from "../schemas";

export const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  message: WebhookMessageSchema,
});

export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;

export const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  message: WebhookMessageSchema,
});

export type UpdateWebhookInput = z.infer<typeof UpdateWebhookSchema>;

export const TestWebhookSchema = z.object({
  url: z.string().url(),
  message: WebhookMessageSchema,
});

export type TestWebhookInput = z.infer<typeof TestWebhookSchema>;

export const WebhooksResponseSchema = z.array(WebhookSchema);

export type WebhooksResponse = z.infer<typeof WebhooksResponseSchema>;
