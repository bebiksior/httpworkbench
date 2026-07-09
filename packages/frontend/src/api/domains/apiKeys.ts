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
import { parseResponse } from "../parseResponse";
import { apiPaths } from "../paths";

export const apiKeysApi = {
  fetchApiKeys: async (): Promise<ApiKeysResponse> => {
    const data = await apiClient.get<unknown>(apiPaths.apiKeys);
    return parseResponse(ApiKeysResponseSchema, data, "API keys");
  },

  createApiKey: async (input: CreateApiKeyInput): Promise<CreatedApiKey> => {
    const validatedInput = CreateApiKeySchema.parse(input);
    const data = await apiClient.post<unknown>(
      apiPaths.apiKeys,
      validatedInput,
    );
    return parseResponse(CreatedApiKeySchema, data, "created API key");
  },

  revokeApiKey: async (id: ApiKey["id"]): Promise<void> => {
    await apiClient.delete<void>(apiPaths.apiKey(id));
  },
};
