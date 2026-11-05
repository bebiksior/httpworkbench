<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { UserNotice } from "shared";
import { userNoticesApi } from "@/api/domains/userNotices";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const { isAuthenticated, isGuest } = storeToRefs(authStore);

const visible = ref(false);
const notices = ref<UserNotice[]>([]);

const load = async () => {
  const list = await userNoticesApi.getPending();
  notices.value = list;
  visible.value = list.length > 0;
};

watch(
  [isAuthenticated, isGuest],
  async () => {
    if (isAuthenticated.value && !isGuest.value) {
      await load();
    } else {
      visible.value = false;
      notices.value = [];
    }
  },
  { immediate: true },
);

const header = computed(() =>
  notices.value.length === 1
    ? "Instance removed"
    : `${notices.value.length} instances removed`,
);

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const dismiss = async () => {
  visible.value = false;
  if (notices.value.length === 0) {
    return;
  }
  notices.value = [];
  await userNoticesApi.acknowledgeAll();
};
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissable-mask
    :draggable="false"
    :header="header"
    :style="{ width: 'min(30rem, calc(100vw - 2rem))' }"
    @update:visible="(value: boolean) => !value && dismiss()"
  >
    <p class="mb-3 text-sm text-surface-700 dark:text-surface-200">
      These instances received excessive traffic and were removed automatically.
      Lock an instance to keep it.
    </p>
    <ul
      class="flex max-h-72 flex-col divide-y divide-surface-200 overflow-y-auto rounded-md border border-surface-200 dark:divide-surface-700 dark:border-surface-700"
    >
      <li
        v-for="notice in notices"
        :key="notice.id"
        class="flex items-center justify-between gap-4 px-3 py-2"
      >
        <div class="min-w-0">
          <div
            class="truncate text-sm font-medium text-surface-800 dark:text-surface-100"
          >
            {{ notice.instanceLabel ?? notice.instanceId }}
          </div>
          <div
            v-if="notice.instanceLabel !== undefined"
            class="font-mono text-xs text-surface-500"
          >
            {{ notice.instanceId }}
          </div>
        </div>
        <div class="shrink-0 text-right text-xs text-surface-500">
          <div>{{ formatTime(notice.createdAt) }}</div>
          <div v-if="notice.requestsInWindow15m !== undefined">
            {{ notice.requestsInWindow15m.toLocaleString("en-US") }} requests
          </div>
        </div>
      </li>
    </ul>
    <template #footer>
      <Button label="Dismiss" @click="dismiss" />
    </template>
  </Dialog>
</template>
