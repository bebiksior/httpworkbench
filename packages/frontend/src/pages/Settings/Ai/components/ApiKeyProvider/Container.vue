<script setup lang="ts">
import Button from "primevue/button";
import Password from "primevue/password";
import { computed, ref, watch } from "vue";
import type { AiApiKeyProvider } from "../../providers";
import { ProviderRow } from "../ProviderRow";

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
  <ProviderRow :icon="provider.icon" :name="provider.name">
    <template v-if="isConfigured" #detail>
      <span>
        <span class="sr-only">Saved key </span>
        <span class="font-mono">{{ maskedSecret }}</span>
      </span>
    </template>

    <template #actions>
      <div
        v-if="isEntering"
        class="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
      >
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
          class="min-w-0 sm:w-60"
          size="small"
          toggle-mask
          @keyup.enter="handleSave"
        />
        <div class="flex gap-2">
          <Button
            label="Save"
            size="small"
            class="flex-1 sm:flex-none"
            :disabled="disabled || !canSave"
            @click="handleSave"
          />
          <Button
            v-if="isEditing"
            label="Cancel"
            size="small"
            severity="secondary"
            text
            class="flex-1 sm:flex-none"
            @click="cancelEditing"
          />
        </div>
      </div>

      <div v-else class="flex w-full shrink-0 gap-2 sm:w-auto">
        <Button
          label="Replace"
          size="small"
          severity="secondary"
          text
          class="flex-1 sm:flex-none"
          :disabled="disabled"
          @click="startEditing"
        />
        <Button
          label="Remove"
          size="small"
          severity="danger"
          text
          class="flex-1 sm:flex-none"
          :disabled="disabled"
          @click="emit('remove')"
        />
      </div>
    </template>
  </ProviderRow>
</template>
