<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import { useConfirm } from "primevue/useconfirm";
import {
  phoneProviders,
  type PhoneProviderConfig,
  type PhoneProviderId,
} from "shared";
import { computed, ref, watch } from "vue";
import { useNotify } from "@/composables";
import {
  useRemovePhoneProvider,
  useSavePhoneProvider,
  useTestPhoneProvider,
} from "@/queries/domains/usePhones";

const props = defineProps<{
  providerId: PhoneProviderId;
  config?: PhoneProviderConfig;
}>();

const notify = useNotify();
const confirm = useConfirm();
const saveMutation = useSavePhoneProvider();
const testMutation = useTestPhoneProvider();
const removeMutation = useRemovePhoneProvider();

const provider = computed(() => phoneProviders[props.providerId]);
const isEditing = ref(false);
const draft = ref<Record<string, string>>({});

const resetDraft = () => {
  draft.value = Object.fromEntries(
    provider.value.fields.map((field) => [
      field.key,
      field.secret ? "" : (props.config?.credentials[field.key] ?? ""),
    ]),
  );
};

watch(() => props.config, resetDraft, { immediate: true });

const isEntering = computed(
  () => props.config === undefined || isEditing.value,
);
const canSave = computed(() =>
  provider.value.fields.every(
    (field) => (draft.value[field.key] ?? "").trim() !== "",
  ),
);
const savedSummary = computed(() =>
  provider.value.fields
    .map((field) => props.config?.credentials[field.key])
    .filter((value) => value !== undefined && value !== "")
    .join(" · "),
);

const startEditing = () => {
  resetDraft();
  isEditing.value = true;
};

const save = () => {
  if (!canSave.value) return;
  saveMutation.mutate(
    { provider: props.providerId, credentials: { ...draft.value } },
    {
      onSuccess: () => {
        isEditing.value = false;
        notify.success(`${provider.value.name} connected`);
      },
      onError: (err) => notify.error("Failed to connect", err),
    },
  );
};

const test = () =>
  testMutation.mutate(props.providerId, {
    onSuccess: ({ phoneCount }) =>
      notify.success(
        "Connection works",
        `${phoneCount} ${phoneCount === 1 ? "number" : "numbers"} found`,
      ),
    onError: (err) => notify.error("Connection failed", err),
  });

const remove = () =>
  confirm.require({
    header: `Remove ${provider.value.name}`,
    message:
      "Remove these credentials? Its numbers disappear from Phones and MCP until you add them again.",
    rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
    acceptProps: { label: "Remove", severity: "danger" },
    accept: () =>
      removeMutation.mutate(props.providerId, {
        onError: (err) => notify.error("Failed to remove provider", err),
      }),
  });
</script>

<template>
  <div class="flex flex-col gap-3 px-4 py-3 sm:px-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-surface-900 dark:text-surface-0">
          {{ provider.name }}
        </p>
        <p
          v-if="config && !isEditing"
          class="mt-0.5 truncate font-mono text-xs text-surface-500 dark:text-surface-400"
        >
          {{ savedSummary }}
        </p>
        <a
          v-else
          :href="provider.url"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-0.5 inline-block text-xs text-surface-500 underline decoration-surface-300 underline-offset-2 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-0"
          >Get an API key</a
        >
      </div>
      <div v-if="config && !isEditing" class="flex shrink-0 gap-2">
        <Button
          label="Test"
          size="small"
          severity="secondary"
          text
          :loading="testMutation.isPending.value"
          @click="test"
        />
        <Button
          label="Replace"
          size="small"
          severity="secondary"
          text
          @click="startEditing"
        />
        <Button
          label="Remove"
          size="small"
          severity="danger"
          text
          :loading="removeMutation.isPending.value"
          @click="remove"
        />
      </div>
    </div>

    <form
      v-if="isEntering"
      class="flex flex-col gap-2 sm:flex-row sm:items-center"
      @submit.prevent="save"
    >
      <template v-for="field in provider.fields" :key="field.key">
        <label :for="`phone-${providerId}-${field.key}`" class="sr-only">{{
          field.label
        }}</label>
        <Password
          v-if="field.secret"
          v-model="draft[field.key]"
          :input-id="`phone-${providerId}-${field.key}`"
          :feedback="false"
          :placeholder="field.placeholder ?? field.label"
          :input-props="{ autocomplete: 'off', spellcheck: false }"
          input-class="w-full font-mono"
          class="min-w-0 sm:flex-1"
          size="small"
          toggle-mask
        />
        <InputText
          v-else
          :id="`phone-${providerId}-${field.key}`"
          v-model="draft[field.key]"
          :placeholder="field.placeholder ?? field.label"
          autocomplete="off"
          spellcheck="false"
          size="small"
          class="min-w-0 sm:flex-1"
        />
      </template>
      <div class="flex gap-2">
        <Button
          type="submit"
          label="Save"
          size="small"
          class="flex-1 sm:flex-none"
          :loading="saveMutation.isPending.value"
          :disabled="!canSave"
        />
        <Button
          v-if="isEditing"
          label="Cancel"
          size="small"
          severity="secondary"
          text
          class="flex-1 sm:flex-none"
          @click="isEditing = false"
        />
      </div>
    </form>
  </div>
</template>
