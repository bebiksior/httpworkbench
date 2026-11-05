import { computed, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useRoute, useRouter } from "vue-router";
import { clampPage, parsePage } from "./pagination";

type Options<T> = {
  items: MaybeRefOrGetter<T[]>;
  pageSize: MaybeRefOrGetter<number>;
  isReady: MaybeRefOrGetter<boolean>;
  resetOn: MaybeRefOrGetter<unknown>;
};

export const usePagination = <T>({
  items,
  pageSize,
  isReady,
  resetOn,
}: Options<T>) => {
  const route = useRoute();
  const router = useRouter();

  const size = computed(() => Math.max(1, toValue(pageSize)));
  const total = computed(() => toValue(items).length);
  const pageCount = computed(() =>
    Math.max(1, Math.ceil(total.value / size.value)),
  );
  const page = computed(() =>
    clampPage(parsePage(route.query.page), pageCount.value),
  );
  const pageSlice = computed(() =>
    toValue(items).slice(
      (page.value - 1) * size.value,
      page.value * size.value,
    ),
  );

  const rangeText = computed(() => {
    const from = total.value === 0 ? 0 : (page.value - 1) * size.value + 1;
    const to = Math.min(total.value, page.value * size.value);
    return `${from.toLocaleString()}–${to.toLocaleString()} of ${total.value.toLocaleString()}`;
  });

  const pageParam = (target: number) =>
    target === 1 ? undefined : String(target);
  const withPage = (target: number) => ({
    query: { ...route.query, page: pageParam(target) },
  });

  const goTo = (target: number) => {
    const next = clampPage(target, pageCount.value);
    if (next !== page.value) void router.push(withPage(next));
  };

  watch(
    [page, () => route.query.page, () => toValue(isReady)],
    ([current, raw, ready]) => {
      if (ready && raw !== pageParam(current)) {
        void router.replace(withPage(current));
      }
    },
    { immediate: true },
  );

  watch(
    () => toValue(resetOn),
    () => {
      if (route.query.page !== undefined) void router.replace(withPage(1));
    },
  );

  return { page, pageCount, pageSlice, rangeText, goTo };
};
