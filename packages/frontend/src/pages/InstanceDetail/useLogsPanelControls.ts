import { useInstanceDetailPreferencesStore } from "@/stores";
import type { Log, LogType } from "shared";
import { refDebounced } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, ref, toValue, type MaybeRefOrGetter, watch } from "vue";
import { useRoute } from "vue-router";

export const useLogsPanelControls = (
  logs: MaybeRefOrGetter<Log[]>,
  setSidePanelHidden: (hidden: boolean) => void,
) => {
  const route = useRoute();
  const preferences = useInstanceDetailPreferencesStore();
  const { selectedLogTypes: selectedTypes } = storeToRefs(preferences);
  const searchQuery = ref("");

  const viewQuery = computed(() => {
    const raw = route.query.view;
    if (Array.isArray(raw)) {
      return raw[0];
    }
    return raw;
  });

  const normalizedSearchQuery = computed(() =>
    searchQuery.value.trim().toLowerCase(),
  );
  const debouncedSearchQuery = refDebounced(normalizedSearchQuery, 150);
  const searchableTextCache = new WeakMap<Log, string>();

  const getSearchableText = (log: Log) => {
    const cached = searchableTextCache.get(log);
    if (cached !== undefined) {
      return cached;
    }
    const searchableText =
      `${log.type}\n${log.address}\n${log.raw}`.toLowerCase();
    searchableTextCache.set(log, searchableText);
    return searchableText;
  };

  const filteredLogs = computed(() => {
    const query = debouncedSearchQuery.value;

    return toValue(logs).filter((log) => {
      if (!selectedTypes.value.includes(log.type)) {
        return false;
      }

      if (query === "") {
        return true;
      }

      return getSearchableText(log).includes(query);
    });
  });

  const eventsLabel = computed(() => {
    const totalLogs = toValue(logs).length;
    if (filteredLogs.value.length === totalLogs) {
      return `${filteredLogs.value.length} events`;
    }
    return `${filteredLogs.value.length} of ${totalLogs} events`;
  });

  const isTypeSelected = (type: LogType) => selectedTypes.value.includes(type);

  const toggleType = (type: LogType) => {
    if (selectedTypes.value.includes(type)) {
      selectedTypes.value = selectedTypes.value.filter(
        (selectedType) => selectedType !== type,
      );
      return;
    }

    selectedTypes.value = [...selectedTypes.value, type];
  };

  const getFilterButtonClass = (active: boolean) =>
    [
      "inline-flex h-9 cursor-pointer items-center rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
      active
        ? "border-primary bg-primary/10 text-primary shadow-sm hover:border-primary hover:bg-primary/15 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-50 dark:hover:border-surface-500 dark:hover:bg-surface-700"
        : "",
      !active
        ? "border-surface-300 bg-white text-surface-600 hover:border-surface-400 hover:bg-surface-50 hover:text-surface-800 dark:border-surface-800 dark:bg-transparent dark:text-surface-400 dark:hover:border-surface-600 dark:hover:bg-surface-900/70 dark:hover:text-surface-200"
        : "",
    ].join(" ");

  watch(
    viewQuery,
    (view) => {
      if (view === "logs") {
        setSidePanelHidden(true);
      }
    },
    { immediate: true },
  );

  return {
    searchQuery,
    filteredLogs,
    eventsLabel,
    isTypeSelected,
    toggleType,
    getFilterButtonClass,
  };
};
