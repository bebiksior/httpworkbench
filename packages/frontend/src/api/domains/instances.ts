import type {
  CreateInstanceInput,
  Instance,
  InstanceDetailResponse,
  RenameInstanceInput,
  SetInstanceLockedInput,
  SetInstancePublicInput,
  UpdateInstanceInput,
} from "shared";
import {
  CreateInstanceSchema,
  InstanceDetailResponseSchema,
  InstanceSchema,
  InstancesResponseSchema,
  RenameInstanceSchema,
  SetInstanceLockedSchema,
  SetInstancePublicSchema,
  UpdateInstanceSchema,
} from "shared";
import { apiClient } from "../client";
import { parseResponse } from "../parseResponse";
import { apiPaths } from "../paths";

export const instancesApi = {
  getAll: async (): Promise<Instance[]> => {
    const data = await apiClient.get<unknown>(apiPaths.instances);
    return parseResponse(InstancesResponseSchema, data, "instances");
  },

  getById: async (id: string): Promise<InstanceDetailResponse> => {
    const data = await apiClient.get<unknown>(apiPaths.instance(id));
    return parseResponse(InstanceDetailResponseSchema, data, "instance detail");
  },

  create: async (input: CreateInstanceInput): Promise<Instance> => {
    const validatedInput = CreateInstanceSchema.parse(input);
    const data = await apiClient.post<unknown>(
      apiPaths.instances,
      validatedInput,
    );
    return parseResponse(InstanceSchema, data, "create instance");
  },

  update: async (id: string, input: UpdateInstanceInput): Promise<Instance> => {
    const validatedInput = UpdateInstanceSchema.parse(input);
    const data = await apiClient.put<unknown>(
      apiPaths.instance(id),
      validatedInput,
    );
    return parseResponse(InstanceSchema, data, "update instance");
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete<void>(apiPaths.instance(id));
  },

  clearLogs: async (id: string): Promise<void> => {
    await apiClient.delete<void>(apiPaths.instanceLogs(id));
  },

  extend: async (id: string): Promise<Instance> => {
    const data = await apiClient.post<unknown>(apiPaths.instanceExtend(id), {});
    return parseResponse(InstanceSchema, data, "extend instance");
  },

  rename: async (id: string, input: RenameInstanceInput): Promise<Instance> => {
    const validatedInput = RenameInstanceSchema.parse(input);
    const data = await apiClient.patch<unknown>(
      apiPaths.instanceRename(id),
      validatedInput,
    );
    return parseResponse(InstanceSchema, data, "rename instance");
  },

  setLocked: async (
    id: string,
    input: SetInstanceLockedInput,
  ): Promise<Instance> => {
    const validatedInput = SetInstanceLockedSchema.parse(input);
    const data = await apiClient.patch<unknown>(
      apiPaths.instanceLock(id),
      validatedInput,
    );
    return parseResponse(InstanceSchema, data, "set locked");
  },

  setPublic: async (
    id: string,
    input: SetInstancePublicInput,
  ): Promise<Instance> => {
    const validatedInput = SetInstancePublicSchema.parse(input);
    const data = await apiClient.patch<unknown>(
      apiPaths.instancePublic(id),
      validatedInput,
    );
    return parseResponse(InstanceSchema, data, "set public");
  },
};
