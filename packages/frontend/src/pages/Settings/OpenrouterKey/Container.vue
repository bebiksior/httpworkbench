<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { useOpenrouterKey } from "./useOpenrouterKey";

const {
  keyInput,
  hasConfiguredKey,
  canSubmit,
  errorMessage,
  handleSave,
  handleRemove,
  handleErrorClose,
} = useOpenrouterKey();
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
      <div>
        <h2 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
          OpenRouter API Key
        </h2>
        <p
          class="text-sm text-surface-600 dark:text-surface-300 mt-1 max-w-2xl"
        >
          Unlock the Assistant feature by providing your OpenRouter key.
        </p>
      </div>
    </div>

    <Message
      v-if="errorMessage"
      severity="error"
      :closable="true"
      class="mb-4"
      @close="handleErrorClose"
    >
      {{ errorMessage }}
    </Message>

    <div class="flex flex-col gap-2">
      <label
        for="openrouter-key-input"
        class="text-sm font-medium text-surface-700 dark:text-surface-200"
      >
        New API key
      </label>
      <InputText
        id="openrouter-key-input"
        v-model="keyInput"
        type="password"
        autocomplete="off"
        placeholder="sk-or-..."
        class="w-full font-mono"
      />
      <p class="text-xs text-surface-600 dark:text-surface-300">
        Keys are stored only in this browser using localStorage and cleared when
        you remove them.
      </p>
    </div>

    <div class="flex flex-wrap gap-3 mt-5">
      <Button
        label="Save key"
        icon="pi pi-save"
        :disabled="!canSubmit"
        @click="handleSave"
      />
      <Button
        label="Remove key"
        icon="pi pi-trash"
        severity="danger"
        outlined
        :disabled="!hasConfiguredKey"
        @click="handleRemove"
      />
    </div>
  </div>
</template>
