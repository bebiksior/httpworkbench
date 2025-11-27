<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { ref, watch, computed } from "vue";
import type { Webhook } from "shared";
import {
  useCreateWebhook,
  useUpdateWebhook,
} from "@/queries/domains/useWebhooks";

const props = defineProps<{
  webhook?: Webhook;
}>();

const emit = defineEmits<{
  (e: "created"): void;
  (e: "updated"): void;
}>();

const name = ref(props.webhook?.name ?? "");
const url = ref(props.webhook?.url ?? "");

watch(
  () => props.webhook,
  (newWebhook) => {
    if (newWebhook !== undefined) {
      name.value = newWebhook.name;
      url.value = newWebhook.url;
    } else {
      name.value = "";
      url.value = "";
    }
  },
);

const createWebhookMutation = useCreateWebhook();
const updateWebhookMutation = useUpdateWebhook();

const isEditing = computed(() => props.webhook !== undefined);

const handleSubmit = async () => {
  if (name.value.trim() === "" || url.value.trim() === "") {
    return;
  }

  if (isEditing.value && props.webhook !== undefined) {
    updateWebhookMutation.mutate(
      {
        id: props.webhook.id,
        input: {
          name: name.value,
          url: url.value,
        },
      },
      {
        onSuccess: () => {
          emit("updated");
        },
      },
    );
  } else {
    createWebhookMutation.mutate(
      {
        name: name.value,
        url: url.value,
      },
      {
        onSuccess: () => {
          name.value = "";
          url.value = "";
          emit("created");
        },
      },
    );
  }
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <Message
      v-if="
        isEditing
          ? updateWebhookMutation.isError.value
          : createWebhookMutation.isError.value
      "
      severity="error"
      :closable="true"
      @close="
        isEditing
          ? updateWebhookMutation.reset()
          : createWebhookMutation.reset()
      "
    >
      {{
        (isEditing
          ? updateWebhookMutation.error.value
          : createWebhookMutation.error.value
        )?.message ?? `Failed to ${isEditing ? "update" : "create"} webhook`
      }}
    </Message>

    <div class="flex flex-col gap-2">
      <label
        for="webhook-name"
        class="text-sm font-medium text-surface-700 dark:text-surface-300"
      >
        Name
      </label>
      <InputText
        id="webhook-name"
        v-model="name"
        placeholder="Blind XSS notifications"
        class="w-full"
      />
    </div>

    <div class="flex flex-col gap-2">
      <label
        for="webhook-url"
        class="text-sm font-medium text-surface-700 dark:text-surface-300"
      >
        Discord Webhook URL
      </label>
      <InputText
        id="webhook-url"
        v-model="url"
        placeholder="https://discord.com/api/webhooks/..."
        class="w-full font-mono"
      />
      <p class="text-xs text-surface-500">
        Get your webhook URL from Discord: Server Settings → Integrations →
        Webhooks
      </p>
    </div>

    <Button
      :label="isEditing ? 'Update Webhook' : 'Create Webhook'"
      :icon="isEditing ? 'pi pi-check' : 'pi pi-plus'"
      :loading="
        isEditing
          ? updateWebhookMutation.isPending.value
          : createWebhookMutation.isPending.value
      "
      :disabled="name.trim() === '' || url.trim() === ''"
      @click="handleSubmit"
    />
  </div>
</template>
