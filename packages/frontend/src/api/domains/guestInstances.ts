import type {
  CreateInstanceInput,
  Instance,
  InstanceDetailResponse,
  SetInstanceLockedInput,
  UpdateInstanceInput,
} from "shared";
import {
  CreateInstanceSchema,
  InstanceDetailResponseSchema,
  InstanceSchema,
  SetInstanceLockedSchema,
  UpdateInstanceSchema,
} from "shared";
import { apiClient } from "../client";
import { ValidationError } from "../errors";
import { apiPaths } from "../paths";

export const guestInstancesApi = {
  create: async (input: CreateInstanceInput): Promise<Instance> => {
    const validatedInput = CreateInstanceSchema.parse(input);
    const data = await apiClient.post<unknown>(
      apiPaths.guestInstances,
      validatedInput,
    );
    const result = InstanceSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid guest create instance response: ${result.error.message}`,
      );
    }

    return result.data;
  },
  getById: async (id: string): Promise<InstanceDetailResponse> => {
    const data = await apiClient.get<unknown>(apiPaths.guestInstance(id));
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
      apiPaths.guestInstance(id),
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
    await apiClient.delete<void>(apiPaths.guestInstance(id));
  },
  clearLogs: async (id: string): Promise<void> => {
    await apiClient.delete<void>(apiPaths.guestInstanceLogs(id));
  },
  setLocked: async (
    id: string,
    input: SetInstanceLockedInput,
  ): Promise<Instance> => {
    const validatedInput = SetInstanceLockedSchema.parse(input);
    const data = await apiClient.patch<unknown>(
      apiPaths.guestInstanceLock(id),
      validatedInput,
    );
    const result = InstanceSchema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(
        `Invalid guest set locked response: ${result.error.message}`,
      );
    }

    return result.data;
  },
};
