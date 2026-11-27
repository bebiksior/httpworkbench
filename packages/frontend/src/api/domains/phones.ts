import type {
  Phone,
  PhoneProviderConfig,
  PhoneProviderId,
  PhoneProviderTestResult,
  PhoneWake,
  SavePhoneProviderInput,
  SmsListResponse,
} from "shared";
import {
  PhoneProviderConfigSchema,
  PhoneProviderConfigsResponseSchema,
  PhoneProviderTestResultSchema,
  PhoneSchema,
  PhonesResponseSchema,
  PhoneWakeSchema,
  SmsListResponseSchema,
} from "shared";
import { apiClient } from "../client";
import { parseResponse } from "../parseResponse";
import { apiPaths } from "../paths";

export const phonesApi = {
  getAll: async (): Promise<Phone[]> =>
    parseResponse(
      PhonesResponseSchema,
      await apiClient.get<unknown>(apiPaths.phones),
      "phones",
    ),

  getSms: async (id: string): Promise<SmsListResponse> =>
    parseResponse(
      SmsListResponseSchema,
      await apiClient.get<unknown>(apiPaths.phoneSms(id)),
      "SMS",
    ),

  updateNotes: async (id: string, notes: string): Promise<Phone> =>
    parseResponse(
      PhoneSchema,
      await apiClient.patch<unknown>(apiPaths.phone(id), { notes }),
      "update phone",
    ),

  wake: async (id: string): Promise<PhoneWake> =>
    parseResponse(
      PhoneWakeSchema,
      await apiClient.post<unknown>(apiPaths.phoneWake(id), {}),
      "wake phone",
    ),

  getProviders: async (): Promise<PhoneProviderConfig[]> =>
    parseResponse(
      PhoneProviderConfigsResponseSchema,
      await apiClient.get<unknown>(apiPaths.phoneProviders),
      "phone providers",
    ),

  saveProvider: async (
    input: SavePhoneProviderInput,
  ): Promise<PhoneProviderConfig> =>
    parseResponse(
      PhoneProviderConfigSchema,
      await apiClient.post<unknown>(apiPaths.phoneProviders, input),
      "save phone provider",
    ),

  testProvider: async (
    provider: PhoneProviderId,
  ): Promise<PhoneProviderTestResult> =>
    parseResponse(
      PhoneProviderTestResultSchema,
      await apiClient.post<unknown>(apiPaths.phoneProviderTest(provider), {}),
      "test phone provider",
    ),

  removeProvider: async (provider: PhoneProviderId): Promise<void> => {
    await apiClient.delete<void>(apiPaths.phoneProvider(provider));
  },
};
