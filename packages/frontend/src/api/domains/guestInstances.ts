import type {
  CreateGuestInstanceInput,
  GuestInstanceCreateResponse,
  GuestInstanceSummariesRequest,
  Instance,
  InstanceDetailResponse,
  InstanceSummary,
  RecentLogsPageResponse,
  SetInstanceLockedInput,
  UpdateInstanceInput,
} from "shared";
import {
  CreateGuestInstanceSchema,
  GuestInstanceCreateResponseSchema,
  GuestInstanceSummariesRequestSchema,
  InstanceDetailResponseSchema,
  InstanceSchema,
  InstancesResponseSchema,
  RecentLogsPageResponseSchema,
  SetInstanceLockedSchema,
} from "shared";
import { apiClient } from "../client";
import { parseResponse } from "../parseResponse";
import { apiPaths } from "../paths";

const GUEST_TOKEN_HEADER = "X-Guest-Token";

const guestTokenHeaders = (token: string) => ({
  [GUEST_TOKEN_HEADER]: token,
});

const recentLogsQuery = (cursor: string) => {
  const params = new URLSearchParams({ limit: "100", cursor });
  return `?${params.toString()}`;
};

export const guestInstancesApi = {
  getSummaries: async (
    input: GuestInstanceSummariesRequest,
  ): Promise<InstanceSummary[]> => {
    const validatedInput = GuestInstanceSummariesRequestSchema.parse(input);
    const data = await apiClient.post<unknown>(
      apiPaths.guestInstanceSummaries,
      validatedInput,
    );
    return parseResponse(
      InstancesResponseSchema,
      data,
      "guest instance summaries",
    );
  },
  create: async (
    input: CreateGuestInstanceInput,
  ): Promise<GuestInstanceCreateResponse> => {
    const validatedInput = CreateGuestInstanceSchema.parse(input);
    const data = await apiClient.post<unknown>(
      apiPaths.guestInstances,
      validatedInput,
    );
    return parseResponse(
      GuestInstanceCreateResponseSchema,
      data,
      "guest create instance",
    );
  },
  getById: async (
    id: string,
    token: string,
  ): Promise<InstanceDetailResponse> => {
    const data = await apiClient.get<unknown>(
      apiPaths.guestInstance(id),
      guestTokenHeaders(token),
    );
    return parseResponse(
      InstanceDetailResponseSchema,
      data,
      "guest instance detail",
    );
  },
  update: async (
    id: string,
    token: string,
    input: UpdateInstanceInput,
  ): Promise<Instance> => {
    const validatedInput = CreateGuestInstanceSchema.parse({ raw: input.raw });
    const data = await apiClient.put<unknown>(
      apiPaths.guestInstance(id),
      validatedInput,
      guestTokenHeaders(token),
    );
    return parseResponse(InstanceSchema, data, "guest update instance");
  },
  delete: async (id: string, token: string): Promise<void> => {
    await apiClient.delete<void>(
      apiPaths.guestInstance(id),
      guestTokenHeaders(token),
    );
  },
  clearLogs: async (id: string, token: string): Promise<void> => {
    await apiClient.delete<void>(
      apiPaths.guestInstanceLogs(id),
      guestTokenHeaders(token),
    );
  },
  setLocked: async (
    id: string,
    token: string,
    input: SetInstanceLockedInput,
  ): Promise<Instance> => {
    const validatedInput = SetInstanceLockedSchema.parse(input);
    const data = await apiClient.patch<unknown>(
      apiPaths.guestInstanceLock(id),
      validatedInput,
      guestTokenHeaders(token),
    );
    return parseResponse(InstanceSchema, data, "guest set locked");
  },
  getOlderLogs: async (
    id: string,
    token: string,
    cursor: string,
  ): Promise<RecentLogsPageResponse> => {
    const data = await apiClient.get<unknown>(
      apiPaths.guestInstanceRecentLogs(id, recentLogsQuery(cursor)),
      guestTokenHeaders(token),
    );
    return parseResponse(
      RecentLogsPageResponseSchema,
      data,
      "guest older logs",
    );
  },
};
