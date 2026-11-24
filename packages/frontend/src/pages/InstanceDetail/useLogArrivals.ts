import type { Log } from "shared";
import {
  nextTick,
  onBeforeUnmount,
  shallowRef,
  watch,
  type Ref,
  type WatchSource,
} from "vue";

const TOP_THRESHOLD_PX = 24;
const HIGHLIGHT_MS = 1200;

export const useLogArrivals = (
  logs: Ref<Log[]>,
  visibleLogs: Ref<Log[]>,
  scroller: Ref<HTMLElement | null>,
  offsetOfIndex: (index: number) => number | undefined,
  resetOn: WatchSource,
) => {
  const freshIds = shallowRef(new Set<string>());
  const unseenIds = shallowRef<string[]>([]);
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const isAtTop = () => (scroller.value?.scrollTop ?? 0) <= TOP_THRESHOLD_PX;

  const highlight = (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    freshIds.value = new Set([...freshIds.value, ...ids]);
    const timer = setTimeout(() => {
      timers.delete(timer);
      const next = new Set(freshIds.value);
      ids.forEach((id) => next.delete(id));
      freshIds.value = next;
    }, HIGHLIGHT_MS);
    timers.add(timer);
  };

  // Only prepends to the unfiltered list are arrivals; filter changes are not.
  watch(logs, async (next, prev) => {
    const previousFirst = prev?.[0];
    if (previousFirst === undefined) {
      return;
    }
    const anchor = next.findIndex((log) => log.id === previousFirst.id);
    if (anchor <= 0) {
      return;
    }
    const arrived = new Set(next.slice(0, anchor).map((log) => log.id));
    const wasAtTop = isAtTop();
    const scrollTop = scroller.value?.scrollTop ?? 0;
    await nextTick();

    let visibleArrived = 0;
    while (
      visibleArrived < visibleLogs.value.length &&
      arrived.has(visibleLogs.value[visibleArrived]?.id ?? "")
    ) {
      visibleArrived += 1;
    }
    const ids = visibleLogs.value.slice(0, visibleArrived).map((log) => log.id);
    if (ids.length === 0) {
      return;
    }
    if (wasAtTop || scroller.value === null) {
      highlight(ids);
      return;
    }

    // Prepending shifts every row down; keep the row being read in place.
    unseenIds.value = [...ids, ...unseenIds.value];
    const shift = offsetOfIndex(visibleArrived);
    if (shift !== undefined && scroller.value !== null) {
      scroller.value.scrollTop = scrollTop + shift;
    }
  });

  watch(resetOn, () => {
    unseenIds.value = [];
  });

  const onScroll = () => {
    if (unseenIds.value.length > 0 && isAtTop()) {
      highlight(unseenIds.value);
      unseenIds.value = [];
    }
  };

  const showNewest = () => {
    if (scroller.value !== null) {
      scroller.value.scrollTop = 0;
    }
    highlight(unseenIds.value);
    unseenIds.value = [];
  };

  onBeforeUnmount(() => timers.forEach(clearTimeout));

  return { freshIds, unseenIds, onScroll, showNewest };
};
