import { useElementSize, useMediaQuery, useResizeObserver } from "@vueuse/core";
import {
  computed,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { clampPage, parsePage } from "./pagination";

type Options<T> = {
  list: Readonly<ShallowRef<HTMLElement | null>>;
  cards: Readonly<ShallowRef<HTMLElement | null>>;
  items: MaybeRefOrGetter<T[]>;
  isReady: MaybeRefOrGetter<boolean>;
  resetOn: MaybeRefOrGetter<unknown>;
};

// Sizes pages to the cards that fit in the list, so the page never scrolls.
export const usePagination = <T>({
  list,
  cards,
  items,
  isReady,
  resetOn,
}: Options<T>) => {
  const route = useRoute();
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const { height: listHeight } = useElementSize(list);
  const cardHeight = ref(0);
  // Read from the list, not a ref on the first card: paging swaps that card out and would reset it.
  useResizeObserver(cards, () => {
    const height =
      cards.value?.firstElementChild?.getBoundingClientRect().height;
    if (height !== undefined && height > 0) cardHeight.value = height;
  });

  const size = computed(() => {
    const gap = isDesktop.value ? 16 : 12;
    const card = cardHeight.value || (isDesktop.value ? 100 : 116);
    return Math.max(1, Math.floor((listHeight.value + gap) / (card + gap)));
  });
  const ready = computed(() => toValue(isReady) && listHeight.value > 0);

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
  const showPager = computed(() => toValue(isReady) && pageCount.value > 1);

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
    [page, () => route.query.page, ready],
    ([current, raw, isPageReady]) => {
      if (isPageReady && raw !== pageParam(current)) {
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

  return {
    page,
    pageCount,
    pageSlice,
    rangeText,
    showPager,
    goTo,
  };
};
