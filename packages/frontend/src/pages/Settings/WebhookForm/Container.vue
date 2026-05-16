<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import { computed, ref, toRefs, watch } from "vue";
import type { Webhook } from "shared";
import {
  useCreateWebhook,
  useTestWebhook,
  useUpdateWebhook,
} from "@/queries/domains/useWebhooks";

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
const testWebhookMutation = useTestWebhook();
const updateWebhookMutation = useUpdateWebhook();

watch([name, url, message], () => {
  testWebhookMutation.reset();
});

const isEditing = computed(() => webhook.value !== undefined);
const normalizedMessage = computed(() => {
  const trimmed = message.value.trim();
  return trimmed === "" ? undefined : trimmed;
});
const placeholders = [
  {
    label: "{{ text }}",
    description: "Inserts the captured raw request or payload text.",
  },
  {
    label: "{{ type }}",
    description: "Inserts the log type, such as HTTP or DNS.",
  },
  {
    label: "{{ address }}",
    description: "Inserts the source address recorded for the log.",
  },
  {
    label: "{{ instanceId }}",
    description: "Inserts the ID of the instance that received the log.",
  },
  {
    label: "{{ timestamp }}",
    description: "Inserts the log timestamp in ISO format.",
  },
] as const;

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

const handleTest = async () => {
  if (url.value.trim() === "") {
    return;
  }

  testWebhookMutation.mutate({
    url: url.value,
    message: normalizedMessage.value,
  });
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <Message
      v-if="testWebhookMutation.isSuccess.value"
      severity="success"
      :closable="true"
      @close="testWebhookMutation.reset()"
    >
      Test notification sent.
    </Message>

    <Message
      v-if="testWebhookMutation.isError.value"
      severity="error"
      :closable="true"
      @close="testWebhookMutation.reset()"
    >
      {{
        testWebhookMutation.error.value?.message ??
        "Failed to send test notification"
      }}
    </Message>

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
      <p class="text-xs text-surface-600 dark:text-surface-300">
        Get your webhook URL from Discord: Server Settings → Integrations →
        Webhooks
      </p>
    </div>

    <div class="flex flex-col gap-2">
      <label
        for="webhook-message"
        class="text-sm font-medium text-surface-700 dark:text-surface-300"
      >
        Custom Message (optional)
      </label>
      <Textarea
        id="webhook-message"
        v-model="message"
        rows="6"
        auto-resize
        :maxlength="2000"
        class="w-full font-mono"
      />
      <div
        class="flex items-center justify-between text-xs text-surface-600 dark:text-surface-300"
      >
        <span>Leave empty to keep the default embed-only notification.</span>
        <span>{{ message.length }}/2000</span>
      </div>
      <p class="text-xs text-surface-600 dark:text-surface-300">
        Optional Discord content. Mentions like
        <code class="font-mono">&lt;@123456789&gt;</code>
        work as-is.
      </p>
      <div
        class="flex flex-col gap-1 text-[11px] text-surface-600 dark:text-surface-300"
      >
        <span>Supported placeholders:</span>
        <div class="flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
          <code
            v-for="placeholder in placeholders"
            :key="placeholder.label"
            v-tooltip.top="placeholder.description"
            class="shrink-0 rounded bg-surface-100 px-1 py-0.5 font-mono text-[10px] leading-none dark:bg-surface-800"
          >
            {{ placeholder.label }}
          </code>
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <Button
        label="Send Test"
        icon="pi pi-send"
        severity="secondary"
        outlined
        class="flex-1"
        :loading="testWebhookMutation.isPending.value"
        :disabled="
          url.trim() === '' ||
          createWebhookMutation.isPending.value ||
          updateWebhookMutation.isPending.value
        "
        @click="handleTest"
      />
      <Button
        :label="isEditing ? 'Update Webhook' : 'Create Webhook'"
        :icon="isEditing ? 'pi pi-check' : 'pi pi-plus'"
        class="flex-1"
        :loading="
          isEditing
            ? updateWebhookMutation.isPending.value
            : createWebhookMutation.isPending.value
        "
        :disabled="name.trim() === '' || url.trim() === ''"
        @click="handleSubmit"
      />
    </div>
  </div>
</template>
