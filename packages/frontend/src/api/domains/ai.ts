import { z } from "zod";
import {
  AiDeviceAuthorizationResultSchema,
  AiDeviceAuthorizationSchema,
  AiSubscriptionCredentialsSchema,
  type AiDeviceAuthorization,
  type AiDeviceAuthorizationPoll,
  type AiSubscriptionCredentials,
  type AiSubscriptionProvider,
} from "shared";
import { apiClient } from "../client";
import { parseResponse } from "../parseResponse";
import { apiPaths } from "../paths";

export { AiSubscriptionCredentialsSchema as SubscriptionCredentialsSchema };
export type {
  AiDeviceAuthorization as DeviceAuthorization,
  AiDeviceAuthorizationPoll as DeviceAuthorizationPoll,
  AiSubscriptionCredentials as SubscriptionCredentials,
  AiSubscriptionProvider as AiSubscriptionProviderId,
};

const parseAiResponse = <Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
) => parseResponse(schema, value, "AI provider");

export const aiApi = {
  requestDeviceAuthorization: async (
    provider: AiSubscriptionProvider,
    signal?: AbortSignal,
  ) => {
    const data = await apiClient.post<unknown>(
      apiPaths.aiOAuthDevice,
      { provider },
      { signal },
    );
    return parseAiResponse(AiDeviceAuthorizationSchema, data);
  },

  pollDeviceAuthorization: async (
    poll: AiDeviceAuthorizationPoll,
    signal?: AbortSignal,
  ) => {
    const data = await apiClient.post<unknown>(apiPaths.aiOAuthPoll, poll, {
      signal,
    });
    return parseAiResponse(AiDeviceAuthorizationResultSchema, data);
  },

  refreshSubscription: async (
    provider: AiSubscriptionProvider,
    refreshToken: string,
  ) => {
    const data = await apiClient.post<unknown>(apiPaths.aiOAuthRefresh, {
      provider,
      refreshToken,
    });
    return parseAiResponse(AiSubscriptionCredentialsSchema, data);
  },
};
