import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { PhoneProviderId, SavePhoneProviderInput } from "shared";
import { phonesApi } from "@/api/domains/phones";
import { queryKeys } from "../keys";

const SMS_REFETCH_INTERVAL_MS = 4_000;
const PHONES_REFETCH_INTERVAL_MS = 30_000;

export const usePhoneProviders = () =>
  useQuery({
    queryKey: queryKeys.phones.providers,
    queryFn: phonesApi.getProviders,
  });

export const usePhones = (enabled: MaybeRefOrGetter<boolean>) =>
  useQuery({
    queryKey: queryKeys.phones.all,
    queryFn: phonesApi.getAll,
    refetchInterval: PHONES_REFETCH_INTERVAL_MS,
    enabled: computed(() => toValue(enabled)),
  });

export const usePhoneSms = (id: MaybeRefOrGetter<string | undefined>) =>
  useQuery({
    queryKey: computed(() => queryKeys.phones.sms(toValue(id) ?? "")),
    queryFn: () => phonesApi.getSms(toValue(id) ?? ""),
    enabled: computed(() => toValue(id) !== undefined),
    refetchInterval: SMS_REFETCH_INTERVAL_MS,
  });

export const useUpdatePhoneNotes = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      phonesApi.updateNotes(id, notes),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.phones.all,
        exact: true,
      }),
  });
};

export const useWakePhone = () =>
  useMutation({ mutationFn: (id: string) => phonesApi.wake(id) });

const useInvalidatePhoneProviders = () => {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.phones.providers }),
      queryClient.invalidateQueries({ queryKey: queryKeys.phones.all }),
    ]);
};

export const useSavePhoneProvider = () => {
  const invalidate = useInvalidatePhoneProviders();
  return useMutation({
    mutationFn: (input: SavePhoneProviderInput) =>
      phonesApi.saveProvider(input),
    onSuccess: invalidate,
  });
};

export const useTestPhoneProvider = () =>
  useMutation({
    mutationFn: (provider: PhoneProviderId) => phonesApi.testProvider(provider),
  });

export const useRemovePhoneProvider = () => {
  const invalidate = useInvalidatePhoneProviders();
  return useMutation({
    mutationFn: (provider: PhoneProviderId) =>
      phonesApi.removeProvider(provider),
    onSuccess: invalidate,
  });
};
