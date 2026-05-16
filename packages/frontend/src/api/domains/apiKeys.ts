import type {
  ApiKey,
  ApiKeysResponse,
  CreatedApiKey,
  CreateApiKeyInput,
} from "shared";
import {
  ApiKeysResponseSchema,
  CreatedApiKeySchema,
  CreateApiKeySchema,
} from "shared";
import { apiClient } from "../client";
import { ValidationError } from "../errors";

export const apiKeysApi = {
  fetchApiKeys: async (): Promise<ApiKeysResponse> => {
    const data = await apiClient.get<unknown>("/api/api-keys");
    const result = ApiKeysResponseSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid API keys response: ${result.error.message}`,
      );
    }

    return result.data;
  },

  createApiKey: async (input: CreateApiKeyInput): Promise<CreatedApiKey> => {
    const validatedInput = CreateApiKeySchema.parse(input);
    const data = await apiClient.post<unknown>("/api/api-keys", validatedInput);
    const result = CreatedApiKeySchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid created API key response: ${result.error.message}`,
      );
    }

    return result.data;
  },

  revokeApiKey: async (id: ApiKey["id"]): Promise<void> => {
    await apiClient.delete<void>(`/api/api-keys/${id}`);
  },
};
