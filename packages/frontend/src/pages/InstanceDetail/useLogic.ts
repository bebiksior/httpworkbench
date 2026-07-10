import { computed, type MaybeRefOrGetter, toValue, watch } from "vue";
import { useRouter } from "vue-router";
import { NotFoundError } from "@/api/errors";
import { guestInstancesApi } from "@/api/domains/guestInstances";
import { instancesApi } from "@/api/domains/instances";
import { useNotify } from "@/composables";
import { useInstanceDetail } from "@/queries/domains/useInstanceDetail";
import { useAuthStore } from "@/stores/auth";
import { useGuestInstancesStore } from "@/stores/guestInstances";
import { isPresent } from "@/utils/types";
import { useInstanceLogStream } from "./useInstanceLogStream";

export const useInstanceDetailLogic = (
  instanceId: MaybeRefOrGetter<string>,
) => {
  const router = useRouter();
  const notify = useNotify();
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const resolvedInstanceId = computed(() => toValue(instanceId));
  const { data, isPending, isFetched, error, refetch } =
    useInstanceDetail(instanceId);
  const getGuestToken = () =>
    authStore.isGuest
      ? guestInstancesStore.getToken(resolvedInstanceId.value)
      : undefined;
  const logStream = useInstanceLogStream(resolvedInstanceId, data, refetch, {
    loadOlderPage: async (cursor) => {
      const token = getGuestToken();
      return token === undefined
        ? instancesApi.getOlderLogs(resolvedInstanceId.value, cursor)
        : guestInstancesApi.getOlderLogs(
            resolvedInstanceId.value,
            token,
            cursor,
          );
    },
    getWebSocketProtocols: () => {
      const token = getGuestToken();
      return token === undefined ? undefined : [`guest-token.${token}`];
    },
  });
  const loadOlderLogs = async () => {
    try {
      await logStream.loadOlder();
    } catch (loadError) {
      notify.error("Failed to load older logs", loadError);
    }
  };

  watch(error, async (newError) => {
    if (!isPresent(newError)) return;
    if (newError instanceof NotFoundError) {
      await router.replace({ name: "notFound" });
      return;
    }
    notify.error("Error loading instance", newError);
    await router.push({ name: authStore.hasSession ? "home" : "login" });
  });

  return {
    instance: computed(() => data.value?.instance),
    logs: logStream.logs,
    hasOlderLogs: logStream.hasOlderLogs,
    isLoadingOlder: logStream.isLoadingOlder,
    loadOlderLogs,
    showNotFound: computed(
      () =>
        isFetched.value &&
        !isPending.value &&
        data.value?.instance === undefined &&
        error.value === undefined,
    ),
    error,
  };
};
