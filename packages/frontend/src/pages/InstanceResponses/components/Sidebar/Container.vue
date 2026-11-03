<script setup lang="ts">
import Button from "primevue/button";
import { MAX_INSTANCE_ROUTES } from "shared";
import { computed, nextTick, ref } from "vue";
import { adjacentKey, statusCode, type RouteDraft } from "../../responseRoutes";
import { FALLBACK_KEY } from "../../useResponsesEditor";
import { PathRow } from "../PathRow";

const props = defineProps<{
  rows: RouteDraft[];
  errors: Record<string, string>;
  selected: string;
  fallbackStatus?: string;
  canAdd: boolean;
}>();
const emit = defineEmits<{ select: [key: string]; add: [path?: string] }>();

const examples = ["/login", "/api/*", "/*.js"];
const list = ref<HTMLElement>();
const keys = computed(() => [
  FALLBACK_KEY,
  ...props.rows.map((draft) => draft.key),
]);
const isFallbackSelected = computed(() => props.selected === FALLBACK_KEY);

const onKeydown = async (event: KeyboardEvent) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const next = adjacentKey(
    keys.value,
    props.selected,
    event.key === "ArrowDown" ? 1 : -1,
  );
  emit("select", next);
  await nextTick();
  list.value?.querySelector<HTMLElement>(`[data-route-key="${next}"]`)?.focus();
};
</script>

<template>
  <aside
    class="flex max-h-[40%] w-full shrink-0 flex-col border-b border-surface-200 lg:max-h-none lg:w-60 lg:border-r lg:border-b-0 dark:border-surface-800"
  >
    <div
      class="flex h-10 shrink-0 items-center justify-between border-b border-surface-200 pr-1.5 pl-3 dark:border-surface-800"
    >
      <span
        class="text-[13px] font-medium text-surface-900 dark:text-surface-0"
      >
        Paths
      </span>
      <Button
        icon="pi pi-plus"
        severity="secondary"
        text
        size="small"
        class="h-7! w-7! p-0!"
        aria-label="Add path"
        :disabled="!canAdd"
        v-tooltip.left="
          canAdd ? 'Add path' : `Up to ${MAX_INSTANCE_ROUTES} paths`
        "
        @click="emit('add')"
      />
    </div>

    <div
      ref="list"
      class="flex min-h-0 flex-1 flex-col"
      role="listbox"
      aria-label="Paths"
      @keydown="onKeydown"
    >
      <button
        type="button"
        role="option"
        :aria-selected="isFallbackSelected"
        :tabindex="isFallbackSelected ? 0 : -1"
        :data-route-key="FALLBACK_KEY"
        class="flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 border-b border-surface-200 px-3 text-left text-[13px] outline-none transition-colors focus-visible:bg-surface-100 dark:border-surface-800 dark:focus-visible:bg-surface-800"
        :class="
          isFallbackSelected
            ? 'bg-surface-100 text-surface-950 dark:bg-surface-800 dark:text-surface-0'
            : 'text-surface-500 hover:bg-surface-50 dark:text-surface-400 dark:hover:bg-surface-800/40'
        "
        @click="emit('select', FALLBACK_KEY)"
      >
        <span class="flex-1">Default</span>
        <span
          class="font-mono text-[11px] text-surface-500 dark:text-surface-400"
        >
          {{ fallbackStatus ?? "" }}
        </span>
      </button>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <PathRow
          v-for="draft in rows"
          :key="draft.key"
          :data-route-key="draft.key"
          :method="draft.method"
          :path="draft.path"
          :status="statusCode(draft.raw)"
          :active="selected === draft.key"
          :error="errors[draft.key]"
          @select="emit('select', draft.key)"
        />
        <div v-if="rows.length === 0" class="px-3 pt-3 text-[13px] leading-5">
          <p class="text-surface-500 dark:text-surface-400">
            No paths yet. Every request gets the default response.
          </p>
          <p class="mt-3 text-surface-500 dark:text-surface-400">
            Add a path to answer it differently, for example
          </p>
          <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            <button
              v-for="example in examples"
              :key="example"
              type="button"
              class="cursor-pointer font-mono text-xs text-surface-700 underline decoration-surface-300 underline-offset-2 hover:decoration-surface-600 dark:text-surface-200 dark:decoration-surface-600 dark:hover:decoration-surface-300"
              @click="emit('add', example)"
            >
              {{ example }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
