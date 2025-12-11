import type {
  CreateInstanceInput,
  Instance,
  InstanceDetailResponse,
  RenameInstanceInput,
  SetInstanceLockedInput,
  UpdateInstanceInput,
} from "shared";
import {
  CreateInstanceSchema,
  InstanceDetailResponseSchema,
  InstanceSchema,
  InstancesResponseSchema,
  RenameInstanceSchema,
  SetInstanceLockedSchema,
  UpdateInstanceSchema,
} from "shared";
import { apiClient } from "../client";
import { ValidationError } from "../errors";

export const instancesApi = {
  getAll: async (): Promise<Instance[]> => {
    const data = await apiClient.get<unknown>("/api/instances");
    const result = InstancesResponseSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid instances response: ${result.error.message}`,
      );
    }

    return result.data;
  },

  getById: async (id: string): Promise<InstanceDetailResponse> => {
    const data = await apiClient.get<unknown>(`/api/instances/${id}`);
    const result = InstanceDetailResponseSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid instance detail response: ${result.error.message}`,
      );
    }

    return result.data;
  },

  create: async (input: CreateInstanceInput): Promise<Instance> => {
    const validatedInput = CreateInstanceSchema.parse(input);
    const data = await apiClient.post<unknown>(
      "/api/instances",
      validatedInput,
    );
    const result = InstanceSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid create instance response: ${result.error.message}`,
      );
    }

    return result.data;
  },

  update: async (id: string, input: UpdateInstanceInput): Promise<Instance> => {
    const validatedInput = UpdateInstanceSchema.parse(input);
    const data = await apiClient.put<unknown>(
      `/api/instances/${id}`,
      validatedInput,
    );
    const result = InstanceSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid update instance response: ${result.error.message}`,
      );
    }

    return result.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete<void>(`/api/instances/${id}`);
  },

  clearLogs: async (id: string): Promise<void> => {
    await apiClient.delete<void>(`/api/instances/${id}/logs`);
  },

  extend: async (id: string): Promise<Instance> => {
    const data = await apiClient.post<unknown>(
      `/api/instances/${id}/extend`,
      {},
    );
    const result = InstanceSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid extend instance response: ${result.error.message}`,
      );
    }

    return result.data;
  },

  rename: async (id: string, input: RenameInstanceInput): Promise<Instance> => {
    const validatedInput = RenameInstanceSchema.parse(input);
    const data = await apiClient.patch<unknown>(
      `/api/instances/${id}/rename`,
      validatedInput,
    );
    const result = InstanceSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid rename instance response: ${result.error.message}`,
      );
    }

    return result.data;
  },

  setLocked: async (
    id: string,
    input: SetInstanceLockedInput,
  ): Promise<Instance> => {
    const validatedInput = SetInstanceLockedSchema.parse(input);
    const data = await apiClient.patch<unknown>(
      `/api/instances/${id}/lock`,
      validatedInput,
    );
    const result = InstanceSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid set locked response: ${result.error.message}`,
      );
    }

    return result.data;
  },
};
