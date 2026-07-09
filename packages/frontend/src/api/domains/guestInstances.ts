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
import { parseResponse } from "../parseResponse";
import { apiPaths } from "../paths";

export const guestInstancesApi = {
  create: async (input: CreateInstanceInput): Promise<Instance> => {
    const validatedInput = CreateInstanceSchema.parse(input);
    const data = await apiClient.post<unknown>(
      apiPaths.guestInstances,
      validatedInput,
    );
    return parseResponse(InstanceSchema, data, "guest create instance");
  },
  getById: async (id: string): Promise<InstanceDetailResponse> => {
    const data = await apiClient.get<unknown>(apiPaths.guestInstance(id));
    return parseResponse(
      InstanceDetailResponseSchema,
      data,
      "guest instance detail",
    );
  },
  update: async (id: string, input: UpdateInstanceInput): Promise<Instance> => {
    const validatedInput = UpdateInstanceSchema.parse(input);
    const data = await apiClient.put<unknown>(
      apiPaths.guestInstance(id),
      validatedInput,
    );
    return parseResponse(InstanceSchema, data, "guest update instance");
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
    return parseResponse(InstanceSchema, data, "guest set locked");
  },
};
