<script setup lang="ts">
import { useTimeAgo } from "@vueuse/core";
import type { Log } from "shared";
import { computed } from "vue";
import { servedStats } from "../../responseRoutes";

const props = defineProps<{ logs: Log[]; label?: string }>();
defineEmits<{ showLogs: [] }>();

const served = computed(() => servedStats(props.logs, props.label));
const lastServedAgo = useTimeAgo(
  computed(() => served.value.lastAt ?? Date.now()),
);
</script>

<template>
  <div
    class="flex h-8 shrink-0 items-center justify-between border-t border-surface-200 px-3 text-xs text-surface-400 dark:border-surface-800 dark:text-surface-500"
  >
    <span v-if="served.count === 0">No recent requests</span>
    <span v-else>
      Served {{ served.count }}
      {{ served.count === 1 ? "request" : "requests" }}, last
      {{ lastServedAgo }}
    </span>
    <button
      v-if="served.count > 0"
      type="button"
      class="cursor-pointer text-surface-500 transition-colors hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100"
      @click="$emit('showLogs')"
    >
      Show in logs
    </button>
  </div>
</template>
