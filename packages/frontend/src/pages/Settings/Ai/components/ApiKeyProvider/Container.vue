<script setup lang="ts">
import Button from "primevue/button";
import Password from "primevue/password";
import { computed, ref, watch } from "vue";
import type { AiApiKeyProvider } from "../../providers";
import { ProviderCard } from "../ProviderCard";

const props = defineProps<{
  provider: AiApiKeyProvider;
  secret: string;
  disabled: boolean;
}>();

const emit = defineEmits<{
  (e: "save", value: string): void;
  (e: "remove"): void;
}>();

const draft = ref("");
const isEditing = ref(false);

const inputId = computed(() => `ai-key-${props.provider.id}`);
const isConfigured = computed(() => props.secret !== "");
const isEntering = computed(() => !isConfigured.value || isEditing.value);
const canSave = computed(() => draft.value.trim() !== "");
const maskedSecret = computed(() => `••••••••${props.secret.slice(-4)}`);

watch(
  () => props.secret,
  () => {
    draft.value = "";
    isEditing.value = false;
  },
);

const startEditing = () => {
  draft.value = "";
  isEditing.value = true;
};

const cancelEditing = () => {
  draft.value = "";
  isEditing.value = false;
};

const handleSave = () => {
  if (!canSave.value) {
    return;
  }
  emit("save", draft.value);
};
</script>

<template>
  <ProviderCard
    :icon="provider.icon"
    :accent-class="provider.accentClass"
    :name="provider.name"
    :description="provider.description"
    :status-label="isConfigured ? 'Configured' : 'Not set'"
    :status-severity="isConfigured ? 'success' : 'secondary'"
    :link-url="provider.linkUrl"
    :link-label="provider.linkLabel"
  >
    <div v-if="isEntering" class="mt-3 flex flex-col gap-2 sm:flex-row">
      <label :for="inputId" class="sr-only">
        {{ provider.name }} API key
      </label>
      <Password
        v-model="draft"
        :input-id="inputId"
        :feedback="false"
        :disabled="disabled"
        :placeholder="provider.placeholder"
        :input-props="{ autocomplete: 'off', spellcheck: false }"
        input-class="w-full font-mono"
        class="min-w-0 flex-1"
        toggle-mask
        @keyup.enter="handleSave"
      />
      <div class="flex gap-2">
        <Button
          label="Save"
          icon="pi pi-check"
          class="flex-1 sm:flex-none"
          :disabled="disabled || !canSave"
          @click="handleSave"
        />
        <Button
          v-if="isEditing"
          label="Cancel"
          severity="secondary"
          outlined
          class="flex-1 sm:flex-none"
          @click="cancelEditing"
        />
      </div>
    </div>

    <div v-else class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <code
        class="min-w-0 flex-1 truncate rounded-md border border-surface-200 bg-surface-50 px-3 py-2 font-mono text-sm text-surface-700 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
      >
        {{ maskedSecret }}
      </code>
      <div class="flex gap-2">
        <Button
          label="Replace"
          icon="pi pi-pencil"
          severity="secondary"
          outlined
          class="flex-1 sm:flex-none"
          :disabled="disabled"
          @click="startEditing"
        />
        <Button
          label="Remove"
          icon="pi pi-trash"
          severity="danger"
          outlined
          class="flex-1 sm:flex-none"
          :disabled="disabled"
          @click="emit('remove')"
        />
      </div>
    </div>
  </ProviderCard>
</template>
