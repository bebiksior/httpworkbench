import type {
  CreateInstanceInput,
  Instance,
  InstanceDetailResponse,
  UpdateInstanceInput,
} from "shared";
import {
  CreateInstanceSchema,
  InstanceDetailResponseSchema,
  InstanceSchema,
  UpdateInstanceSchema,
} from "shared";
import { apiClient } from "../client";
import { ValidationError } from "../errors";

const basePath = "/api/guest/instances";

export const guestInstancesApi = {
  create: async (input: CreateInstanceInput): Promise<Instance> => {
    const validatedInput = CreateInstanceSchema.parse(input);
    const data = await apiClient.post<unknown>(basePath, validatedInput);
    const result = InstanceSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid guest create instance response: ${result.error.message}`,
      );
    }

    return result.data;
  },
  getById: async (id: string): Promise<InstanceDetailResponse> => {
    const data = await apiClient.get<unknown>(`${basePath}/${id}`);
    const result = InstanceDetailResponseSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid guest instance detail response: ${result.error.message}`,
      );
    }

    return result.data;
  },
  update: async (id: string, input: UpdateInstanceInput): Promise<Instance> => {
    const validatedInput = UpdateInstanceSchema.parse(input);
    const data = await apiClient.put<unknown>(
      `${basePath}/${id}`,
      validatedInput,
    );
    const result = InstanceSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid guest update instance response: ${result.error.message}`,
      );
    }

    return result.data;
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete<void>(`${basePath}/${id}`);
  },
  clearLogs: async (id: string): Promise<void> => {
    await apiClient.delete<void>(`${basePath}/${id}/logs`);
  },
};
