<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { computed, ref, watch } from "vue";
import type { SubscriptionCredentials } from "@/api/domains/ai";
import type { AiSubscriptionProvider } from "../../providers";
import type { SubscriptionConnectionState } from "../../useAi";
import { ProviderRow } from "../ProviderRow";

const props = defineProps<{
  provider: AiSubscriptionProvider;
  credentials?: SubscriptionCredentials;
  connection: SubscriptionConnectionState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  connect: [];
  cancel: [];
  disconnect: [];
}>();

const showDialog = ref(false);
const copied = ref(false);
const isConnected = computed(() => props.credentials !== undefined);

watch(
  () => props.credentials,
  (credentials) => {
    if (credentials !== undefined) showDialog.value = false;
  },
);

const startConnection = () => {
  copied.value = false;
  showDialog.value = true;
  emit("connect");
};

const copyCode = async () => {
  if (props.connection.kind !== "waiting") return;
  try {
    await navigator.clipboard.writeText(
      props.connection.authorization.userCode,
    );
    copied.value = true;
  } catch {
    copied.value = false;
  }
};

const closeDialog = () => {
  showDialog.value = false;
};
</script>

<template>
  <ProviderRow :icon="provider.icon" :name="provider.name">
    <template #detail>
      <span v-if="isConnected">Connected</span>
      <template v-else>{{ provider.description }}</template>
    </template>

    <template #actions>
      <div class="flex w-full shrink-0 gap-2 sm:w-auto">
        <Button
          v-if="!isConnected"
          label="Connect"
          size="small"
          class="flex-1 sm:flex-none"
          :disabled="disabled"
          @click="startConnection"
        />
        <template v-else>
          <Button
            label="Reconnect"
            size="small"
            severity="secondary"
            text
            class="flex-1 sm:flex-none"
            :disabled="disabled"
            @click="startConnection"
          />
          <Button
            label="Disconnect"
            size="small"
            severity="danger"
            text
            class="flex-1 sm:flex-none"
            :disabled="disabled"
            @click="emit('disconnect')"
          />
        </template>
      </div>
    </template>
  </ProviderRow>

  <Dialog
    v-model:visible="showDialog"
    :header="`Connect ${provider.name}`"
    :style="{ width: 'min(480px, calc(100vw - 2rem))' }"
    modal
    @hide="emit('cancel')"
  >
    <div
      v-if="connection.kind === 'starting'"
      class="flex flex-col items-center gap-3 py-8 text-center"
    >
      <i class="pi pi-spinner pi-spin text-2xl text-primary-500" />
      <p class="text-sm text-surface-600 dark:text-surface-300">
        Preparing secure sign-in…
      </p>
    </div>

    <div v-else-if="connection.kind === 'waiting'" class="flex flex-col gap-5">
      <p class="text-sm text-surface-600 dark:text-surface-300">
        Open the provider sign-in page, then enter this one-time code. This
        dialog will update automatically when authorization completes.
      </p>

      <button
        type="button"
        class="group flex w-full items-center justify-between rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 text-left transition-colors hover:border-primary-400 dark:border-surface-700 dark:bg-surface-900"
        @click="copyCode"
      >
        <span class="font-mono text-xl font-semibold tracking-[0.2em]">
          {{ connection.authorization.userCode }}
        </span>
        <span class="text-xs text-surface-500">
          {{ copied ? "Copied" : "Copy code" }}
        </span>
      </button>

      <Button
        as="a"
        :href="connection.authorization.verificationUri"
        target="_blank"
        rel="noreferrer"
        label="Open sign-in page"
        icon="pi pi-external-link"
        class="w-full"
      />

      <div
        class="flex items-center justify-center gap-2 text-xs text-surface-500"
      >
        <i class="pi pi-spinner pi-spin" />
        Waiting for authorization
      </div>
    </div>

    <div v-else-if="connection.kind === 'error'" class="flex flex-col gap-4">
      <Message severity="error" :closable="false">
        {{ connection.message }}
      </Message>
      <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          label="Close"
          severity="secondary"
          outlined
          @click="closeDialog"
        />
        <Button
          label="Try again"
          icon="pi pi-refresh"
          @click="emit('connect')"
        />
      </div>
    </div>
  </Dialog>
</template>
