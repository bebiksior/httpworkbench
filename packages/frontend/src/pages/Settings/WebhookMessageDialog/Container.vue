<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Textarea from "primevue/textarea";

const visible = defineModel<boolean>("visible", { required: true });
const message = defineModel<string>("message", { required: true });

const placeholders = [
  "{{ text }}",
  "{{ type }}",
  "{{ address }}",
  "{{ instanceId }}",
  "{{ timestamp }}",
] as const;

const handleClear = () => {
  message.value = "";
};
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Webhook Message"
    :style="{ width: '42rem', maxWidth: 'calc(100vw - 2rem)' }"
  >
    <div class="flex flex-col gap-4">
      <Message severity="info" :closable="false">
        <div class="flex flex-col gap-2 text-sm">
          <p>
            Add optional Discord content before the default embed. Mentions like
            <code class="font-mono">&lt;@123456789&gt;</code> work as-is.
          </p>
          <p class="flex flex-wrap gap-2">
            <span>Supported placeholders:</span>
            <code
              v-for="placeholder in placeholders"
              :key="placeholder"
              class="rounded bg-surface-100 px-1.5 py-0.5 font-mono text-xs dark:bg-surface-800"
            >
              {{ placeholder }}
            </code>
          </p>
        </div>
      </Message>

      <div class="flex flex-col gap-2">
        <label
          for="webhook-message"
          class="text-sm font-medium text-surface-700 dark:text-surface-300"
        >
          Message Template
        </label>
        <Textarea
          id="webhook-message"
          v-model="message"
          rows="10"
          auto-resize
          :maxlength="2000"
          class="w-full font-mono"
        />
        <div class="flex items-center justify-between text-xs text-surface-500">
          <span>Leave empty to keep the default embed-only notification.</span>
          <span>{{ message.length }}/2000</span>
        </div>
      </div>
    </div>

    <template #footer>
      <Button
        label="Clear"
        text
        severity="secondary"
        :disabled="message.length === 0"
        @click="handleClear"
      />
      <Button label="Done" @click="visible = false" />
    </template>
  </Dialog>
</template>
