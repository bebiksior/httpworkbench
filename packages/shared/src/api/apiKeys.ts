import { z } from "zod";
import { ApiKeySchema, ApiKeyScopeSchema } from "../schemas";

export const ApiKeyScopesSchema = z.array(ApiKeyScopeSchema).min(1);

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: ApiKeyScopesSchema.optional(),
  expiresAt: z.number().optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

export const CreatedApiKeySchema = z.object({
  apiKey: ApiKeySchema,
  secret: z.string(),
});

export type CreatedApiKey = z.infer<typeof CreatedApiKeySchema>;

export const ApiKeysResponseSchema = z.array(ApiKeySchema);

export type ApiKeysResponse = z.infer<typeof ApiKeysResponseSchema>;
