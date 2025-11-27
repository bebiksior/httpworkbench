import { z } from "zod";
import { WebhookSchema } from "../schemas";

export const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;

export const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

export type UpdateWebhookInput = z.infer<typeof UpdateWebhookSchema>;

export const WebhooksResponseSchema = z.array(WebhookSchema);

export type WebhooksResponse = z.infer<typeof WebhooksResponseSchema>;
