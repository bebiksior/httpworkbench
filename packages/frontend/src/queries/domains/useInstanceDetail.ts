import { useQuery } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { storeToRefs } from "pinia";
import { guestInstancesApi } from "@/api/domains/guestInstances";
import { instancesApi } from "@/api/domains/instances";
import { NotFoundError } from "@/api/errors";
import { queryKeys } from "@/queries/keys";
import { useAuthStore, useGuestInstancesStore } from "@/stores";

export const useInstanceDetail = (instanceId: MaybeRefOrGetter<string>) => {
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);

  return useQuery({
    queryKey: computed(() => [
      ...queryKeys.instances.detail(toValue(instanceId)),
      isGuest.value ? "guest" : "user",
    ]),
    queryFn: async () => {
      const id = toValue(instanceId);
      try {
        if (isGuest.value) {
          return await guestInstancesApi.getById(id);
        }
        return await instancesApi.getById(id);
      } catch (error) {
        if (isGuest.value && error instanceof NotFoundError) {
          guestInstancesStore.forgetInstance(id);
        }
        throw error;
      }
    },
    retry: false,
  });
};
