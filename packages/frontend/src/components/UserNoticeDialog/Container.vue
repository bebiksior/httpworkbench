<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { UserNotice } from "shared";
import { userNoticesApi } from "@/api/domains/userNotices";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const { isAuthenticated, isGuest } = storeToRefs(authStore);

const visible = ref(false);
const notices = ref<UserNotice[]>([]);
const loading = ref(false);

const load = async () => {
  if (!isAuthenticated.value || isGuest.value) {
    return;
  }
  loading.value = true;
  try {
    const list = await userNoticesApi.getPending();
    notices.value = list;
    visible.value = list.length > 0;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  if (isAuthenticated.value && !isGuest.value) {
    void load();
  }
});

watch([isAuthenticated, isGuest], () => {
  if (isAuthenticated.value && !isGuest.value) {
    void load();
  } else {
    visible.value = false;
    notices.value = [];
  }
});

const currentNotice = computed(() => notices.value[0]);

const handleAck = async () => {
  const n = currentNotice.value;
  if (n === undefined) {
    return;
  }
  await userNoticesApi.acknowledge(n.id);
  notices.value = notices.value.slice(1);
  if (notices.value.length === 0) {
    visible.value = false;
  }
};
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Instance removed"
    :closable="false"
    :style="{ width: '25rem' }"
  >
    <p
      v-if="currentNotice !== undefined"
      class="text-surface-700 dark:text-surface-200 text-sm"
    >
      Instance
      <span class="font-mono">{{ currentNotice.instanceId }}</span>
      was removed automatically due to excessive traffic (abuse protection).
    </p>
    <p v-else-if="loading" class="text-surface-500 text-sm">Loading…</p>
    <template #footer>
      <Button
        label="OK"
        :disabled="currentNotice === undefined || loading"
        @click="handleAck"
      />
    </template>
  </Dialog>
</template>
