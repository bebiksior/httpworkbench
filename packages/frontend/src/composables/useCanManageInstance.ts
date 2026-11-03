import { storeToRefs } from "pinia";
import { GUEST_OWNER_ID, type Instance } from "shared";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useGuestInstancesStore } from "@/stores/guestInstances";

export const useCanManageInstance = (
  instance: MaybeRefOrGetter<Instance | undefined>,
) => {
  const authStore = useAuthStore();
  const { isGuest } = storeToRefs(authStore);
  const { ids: guestInstanceIds } = storeToRefs(useGuestInstancesStore());

  return computed(() => {
    const current = toValue(instance);
    if (current === undefined) {
      return false;
    }
    if (current.ownerId === GUEST_OWNER_ID) {
      return isGuest.value && guestInstanceIds.value.includes(current.id);
    }
    if (isGuest.value) {
      return false;
    }
    return authStore.user?.id === current.ownerId;
  });
};

export const useCanEditResponses = (
  instance: MaybeRefOrGetter<Instance | undefined>,
) => {
  const canManage = useCanManageInstance(instance);
  const { isGuest } = storeToRefs(useAuthStore());
  return computed(() => canManage.value && !isGuest.value);
};
