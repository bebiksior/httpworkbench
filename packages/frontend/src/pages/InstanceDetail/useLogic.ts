import { computed, type MaybeRefOrGetter, toValue, watch } from "vue";
import { useRouter } from "vue-router";
import { NotFoundError } from "@/api/errors";
import { useNotify } from "@/composables";
import { useInstanceDetail } from "@/queries/domains/useInstanceDetail";
import { useAuthStore } from "@/stores";
import { isPresent } from "@/utils/types";
import { useInstanceLogStream } from "./useInstanceLogStream";

export const useInstanceDetailLogic = (
  instanceId: MaybeRefOrGetter<string>,
) => {
  const router = useRouter();
  const notify = useNotify();
  const authStore = useAuthStore();
  const resolvedInstanceId = computed(() => toValue(instanceId));
  const { data, isPending, isFetched, error, refetch } =
    useInstanceDetail(instanceId);
  const logs = useInstanceLogStream(resolvedInstanceId, data, refetch);

  watch(error, (newError) => {
    if (!isPresent(newError)) return;
    if (newError instanceof NotFoundError) {
      void router.replace({ name: "notFound" });
      return;
    }
    notify.error("Error loading instance", newError);
    void router.push({ name: authStore.hasSession ? "home" : "login" });
  });

  return {
    instance: computed(() => data.value?.instance),
    logs,
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
