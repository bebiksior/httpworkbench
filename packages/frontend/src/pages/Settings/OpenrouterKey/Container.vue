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
  <div class="bg-surface-900/70 border border-surface-800 rounded-2xl p-6 mb-8">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
      <div>
        <h2 class="text-2xl font-semibold text-surface-0">
          OpenRouter API Key
        </h2>
        <p class="text-sm text-surface-400 mt-1 max-w-2xl">
          Store your personal OpenRouter key securely to unlock model access in
          the assistant.
        </p>
      </div>
      <div
        class="flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium"
        :class="
          hasConfiguredKey
            ? 'bg-emerald-500/10 text-emerald-300'
            : 'bg-surface-700 text-surface-200'
        "
      >
        <i
          :class="hasConfiguredKey ? 'pi pi-check-circle' : 'pi pi-info-circle'"
        />
        <span>{{ hasConfiguredKey ? "Configured" : "Not configured" }}</span>
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
        class="text-sm font-medium text-surface-200"
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
      <p class="text-xs text-surface-500">
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
