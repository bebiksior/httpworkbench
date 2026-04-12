<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { computed, ref, toRefs, watch } from "vue";
import type { Webhook } from "shared";
import {
  useCreateWebhook,
  useUpdateWebhook,
} from "@/queries/domains/useWebhooks";
import { WebhookMessageDialog } from "../WebhookMessageDialog";

const props = defineProps<{
  webhook?: Webhook;
}>();

const emit = defineEmits<{
  (e: "created"): void;
  (e: "updated"): void;
}>();

const { webhook } = toRefs(props);

const name = ref(webhook.value?.name ?? "");
const url = ref(webhook.value?.url ?? "");
const message = ref(webhook.value?.message ?? "");
const showMessageDialog = ref(false);

watch(webhook, (newWebhook) => {
  if (newWebhook !== undefined) {
    name.value = newWebhook.name;
    url.value = newWebhook.url;
    message.value = newWebhook.message ?? "";
  } else {
    name.value = "";
    url.value = "";
    message.value = "";
  }
});

const createWebhookMutation = useCreateWebhook();
const updateWebhookMutation = useUpdateWebhook();

const isEditing = computed(() => webhook.value !== undefined);
const normalizedMessage = computed(() => {
  const trimmed = message.value.trim();
  return trimmed === "" ? undefined : trimmed;
});
const textPlaceholder = "{{ text }}";
const messagePreview = computed(() => {
  if (normalizedMessage.value === undefined) {
    return "Default embed only";
  }

  return normalizedMessage.value;
});

const handleSubmit = async () => {
  if (name.value.trim() === "" || url.value.trim() === "") {
    return;
  }

  if (isEditing.value && webhook.value !== undefined) {
    updateWebhookMutation.mutate(
      {
        id: webhook.value.id,
        input: {
          name: name.value,
          url: url.value,
          message: normalizedMessage.value,
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
        message: normalizedMessage.value,
      },
      {
        onSuccess: () => {
          name.value = "";
          url.value = "";
          message.value = "";
          emit("created");
        },
      },
    );
  }
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <WebhookMessageDialog
      v-model:visible="showMessageDialog"
      v-model:message="message"
    />

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

    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-3">
        <label
          class="text-sm font-medium text-surface-700 dark:text-surface-300"
        >
          Custom Message
        </label>
        <Button
          label="Edit Message"
          icon="pi pi-pencil"
          size="small"
          text
          @click="showMessageDialog = true"
        />
      </div>
      <div
        class="rounded-xl border border-surface-200 bg-surface-50 p-3 text-sm text-surface-700 dark:border-surface-700 dark:bg-surface-800/50 dark:text-surface-200"
      >
        <p class="font-mono whitespace-pre-wrap break-words">
          {{ messagePreview }}
        </p>
      </div>
      <p class="text-xs text-surface-500">
        Optional Discord content. Supports placeholders like
        <code class="font-mono">{{ textPlaceholder }}</code>
        and mentions such as
        <code class="font-mono">&lt;@123456789&gt;</code>.
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
