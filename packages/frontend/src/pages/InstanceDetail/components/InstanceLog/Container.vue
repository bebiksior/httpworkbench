<script setup lang="ts">
import type { Log } from "shared";
import { computed, toRefs } from "vue";
import Tag from "primevue/tag";
import { useTimeAgo } from "@vueuse/core";
import dayjs from "dayjs";
import { HTTPLog } from "./components/HTTPLog";
import { DNSLog } from "./components/DNSLog";

const props = defineProps<{
  log: Log;
}>();

const { log } = toRefs(props);

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

const getSeverity = (type: string) => {
  switch (type) {
    case "http":
      return "info";
    case "dns":
      return "warning";
    default:
      return "secondary";
  }
};
</script>

<template>
  <div
    class="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-white dark:bg-surface-800 shadow-sm"
  >
    <div
      class="bg-surface-50 dark:bg-surface-900/50 px-4 py-3 text-xs text-surface-500 border-b border-surface-200 dark:border-surface-700 flex justify-between items-center"
    >
      <div class="flex items-center gap-2">
        <Tag
          :value="log.type.toUpperCase()"
          :severity="getSeverity(log.type)"
          rounded
          size="small"
        />
        <span class="font-mono text-surface-600 dark:text-surface-400">{{
          log.address
        }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span>{{ formattedTimestamp }}</span>
        <span class="text-surface-400">•</span>
        <span class="text-surface-400" :title="absoluteTimestamp">{{
          absoluteTimestamp
        }}</span>
      </div>
    </div>
    <div class="p-0">
      <HTTPLog v-if="log.type === 'http'" :log="log" />
      <DNSLog v-else-if="log.type === 'dns'" :log="log" />
      <div v-else class="p-4 text-surface-500">Unknown log type</div>
    </div>
  </div>
</template>
