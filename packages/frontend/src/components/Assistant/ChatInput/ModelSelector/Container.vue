<script setup lang="ts">
import { computed } from "vue";
import { REASONING_EFFORT_LABELS } from "@/agent/types/config";
import SelectMenu from "./SelectMenu.vue";
import type { SelectMenuOption } from "./types";
import { useSelector } from "./useSelector";

defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  requestFocusInput: [];
}>();

const { models, modelId, reasoningEffort, selectedModel } = useSelector();

const modelOptions = computed<SelectMenuOption[]>(() =>
  models.value.map((model) => ({
    value: model.id,
    label: model.name,
    description: model.providerName,
    icon: model.icon,
  })),
);

const reasoningOptions = computed<SelectMenuOption[]>(() =>
  (selectedModel.value?.reasoningEfforts ?? []).map((effort) => ({
    value: effort,
    label: REASONING_EFFORT_LABELS[effort],
  })),
);

const handleModelSelect = (value: string) => {
  modelId.value = value;
};

const handleReasoningSelect = (value: string) => {
  const effort = selectedModel.value?.reasoningEfforts.find(
    (item) => item === value,
  );

  if (effort !== undefined) {
    reasoningEffort.value = effort;
  }
};
</script>

<template>
  <div
    class="flex min-w-0 items-center rounded-lg border border-surface-700/70 bg-surface-900/70 p-0.5"
  >
    <SelectMenu
      :model-value="modelId"
      :options="modelOptions"
      :disabled="disabled"
      label="Model"
      menu-class="w-72"
      mono
      class="text-surface-300"
      @update:model-value="handleModelSelect"
      @selected="emit('requestFocusInput')"
    >
      <template #trigger>
        <component
          :is="selectedModel?.icon"
          v-if="selectedModel?.icon !== undefined"
          class="h-4 w-4 shrink-0 text-surface-0"
        />
        <div v-else class="h-3 w-3 shrink-0 rounded-sm bg-surface-500" />
        <span class="max-w-40 truncate font-mono">
          {{ selectedModel?.name ?? "Select model" }}
        </span>
      </template>
    </SelectMenu>

    <span
      v-if="reasoningOptions.length > 0"
      aria-hidden="true"
      class="mx-0.5 h-4 w-px shrink-0 bg-surface-700/70"
    />

    <SelectMenu
      v-if="reasoningOptions.length > 0"
      :model-value="reasoningEffort"
      :options="reasoningOptions"
      :disabled="disabled"
      label="Reasoning effort"
      menu-class="w-44"
      class="text-surface-400"
      @update:model-value="handleReasoningSelect"
      @selected="emit('requestFocusInput')"
    >
      <template #trigger>
        <span class="truncate">
          {{ REASONING_EFFORT_LABELS[reasoningEffort] }}
        </span>
      </template>
    </SelectMenu>
  </div>
</template>
