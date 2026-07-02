<script setup lang="ts">
import type { Log } from "shared";
import { computed, toRefs } from "vue";
import { useTimeAgo } from "@vueuse/core";
import dayjs from "dayjs";
import { HTTPLog } from "./components/HTTPLog";
import { DNSLog } from "./components/DNSLog";
import { SMTPLog, useSmtpLogDisplay } from "./components/SMTPLog";

const props = defineProps<{
  log: Log;
}>();

const { log } = toRefs(props);
const {
  displayModeLabel: smtpDisplayModeLabel,
  displayedRaw: smtpDisplayedRaw,
  nextDisplayModeLabel: nextSmtpDisplayModeLabel,
  toggleDisplayMode: toggleSmtpDisplayMode,
} = useSmtpLogDisplay(() => log.value.raw);

const badgeClass = computed(() => {
  switch (log.value.type) {
    case "http":
      return "border-sky-400/30 bg-sky-400/10 text-sky-600 dark:text-sky-300";
    case "dns":
      return "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300";
    case "smtp":
      return "border-violet-400/30 bg-violet-400/10 text-violet-600 dark:text-violet-300";
    default:
      return "border-surface-300/40 bg-surface-300/10 text-surface-600 dark:text-surface-300";
  }
});

const relativeTimestamp = useTimeAgo(() => log.value.timestamp);
const formattedTimestamp = computed(() => {
  const logDate = dayjs(log.value.timestamp);
  if (dayjs().diff(logDate, "day") >= 1) {
    return logDate.format("MMM D, YYYY h:mm A");
  }
  return relativeTimestamp.value;
});

const absoluteTimestamp = computed(() =>
  dayjs(log.value.timestamp).format("MMM D, YYYY h:mm:ss A"),
);

const smtpDisplayModeTitle = computed(
  () => `Switch to ${nextSmtpDisplayModeLabel.value} SMTP log`,
);

const smtpDisplayModeIcon = computed(() =>
  smtpDisplayModeLabel.value === "decoded" ? "pi pi-code" : "pi pi-file",
);

const handleMouseLeave = (event: MouseEvent) => {
  const card = event.currentTarget;
  const active = document.activeElement;
  if (
    card instanceof HTMLElement &&
    active instanceof HTMLElement &&
    card.contains(active) &&
    active.closest(".cm-editor") !== null
  ) {
    active.blur();
  }
};
</script>

<template>
  <div
    class="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-white dark:bg-surface-800 shadow-sm"
    @mouseleave="handleMouseLeave"
  >
    <div
      class="flex items-center justify-between gap-2 border-b border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-700 dark:border-surface-700 dark:bg-surface-900/50 dark:text-surface-400 sm:px-4 sm:py-3"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span
          class="shrink-0 rounded border px-1.5 py-0.5 font-semibold leading-none"
          :class="badgeClass"
        >
          {{ log.type.toUpperCase() }}
        </span>
        <span
          class="min-w-0 truncate font-mono text-surface-800 dark:text-surface-300"
          >{{ log.address }}</span
        >
      </div>
      <div
        class="flex min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap text-right"
      >
        <span>{{ formattedTimestamp }}</span>
        <span class="text-surface-500 dark:text-surface-500">•</span>
        <span
          class="hidden text-surface-600 dark:text-surface-500 min-[420px]:inline"
          :title="absoluteTimestamp"
          >{{ absoluteTimestamp }}</span
        >
        <template v-if="log.type === 'smtp'">
          <span class="text-surface-500 dark:text-surface-500">•</span>
          <button
            type="button"
            class="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-surface-300 bg-white px-2 text-[11px] font-semibold capitalize leading-none text-surface-700 shadow-sm transition-colors hover:border-surface-400 hover:bg-surface-100 hover:text-surface-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200 dark:hover:border-surface-500 dark:hover:bg-surface-700 dark:hover:text-surface-0"
            :aria-label="smtpDisplayModeTitle"
            :title="smtpDisplayModeTitle"
            @click.stop="toggleSmtpDisplayMode"
          >
            <i
              :class="smtpDisplayModeIcon"
              class="text-[10px]"
              aria-hidden="true"
            />
            {{ smtpDisplayModeLabel }}
          </button>
        </template>
      </div>
    </div>
    <div class="p-0">
      <HTTPLog v-if="log.type === 'http'" :log="log" />
      <DNSLog v-else-if="log.type === 'dns'" :log="log" />
      <SMTPLog v-else-if="log.type === 'smtp'" :raw="smtpDisplayedRaw" />
      <div v-else class="p-4 text-surface-700 dark:text-surface-400">
        Unknown log type
      </div>
    </div>
  </div>
</template>
