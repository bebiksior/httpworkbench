<script setup lang="ts">
import Button from "primevue/button";
import { ROUTE_METHODS, type RouteMethod } from "shared";
import { computed, nextTick, ref, watch } from "vue";
import { type RouteDraft } from "./responseRoutes";
import { DEFAULT_RESPONSE } from "./useInstanceEditor";

const props = defineProps<{
  drafts: RouteDraft[];
  errors: Record<string, string>;
  dirty: Set<string>;
  selected: string;
  editable: boolean;
  focusPathRequest: number;
  focusTabRequest: number;
}>();

const emit = defineEmits<{
  select: [key: string];
  remove: [key: string];
  emptied: [];
  setPath: [key: string, path: string];
  setMethod: [key: string, method: RouteMethod | undefined];
}>();

const panelId = "response-panel";
const tabId = (key: string) => `response-tab-${key}`;
const errorId = "response-path-error";

const tabKeys = computed(() => [
  DEFAULT_RESPONSE,
  ...props.drafts.map((draft) => draft.key),
]);
const active = computed(() =>
  props.drafts.find((draft) => draft.key === props.selected),
);
const activeError = computed(() =>
  active.value === undefined ? undefined : props.errors[active.value.key],
);

const pathInputRef = ref<HTMLInputElement | null>(null);

const focusPath = () =>
  nextTick(() => {
    document
      .getElementById(tabId(props.selected))
      ?.scrollIntoView({ block: "nearest" });
    pathInputRef.value?.focus();
    pathInputRef.value?.select();
  });

const focusTab = (key: string) =>
  nextTick(() => {
    const tab = document.getElementById(tabId(key));
    tab?.focus();
    tab?.scrollIntoView({ block: "nearest" });
  });

watch(() => props.focusPathRequest, focusPath);
watch(
  () => props.focusTabRequest,
  () => focusTab(props.selected),
);

const handleRemove = (key: string) => {
  emit("remove", key);
  nextTick(() => {
    if (props.drafts.length === 0) {
      emit("emptied");
      return;
    }
    focusTab(props.selected);
  });
};

const moveSelection = (event: KeyboardEvent) => {
  const keys = tabKeys.value;
  const index = keys.indexOf(props.selected);
  const nextIndex = {
    ArrowRight: (index + 1) % keys.length,
    ArrowLeft: (index - 1 + keys.length) % keys.length,
    Home: 0,
    End: keys.length - 1,
  }[event.key];
  const next = nextIndex === undefined ? undefined : keys[nextIndex];
  if (next === undefined) return;
  event.preventDefault();
  emit("select", next);
  focusTab(next);
};

const tabClass = (key: string) => [
  "inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-md px-2 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 pointer-coarse:h-9",
  key === props.selected
    ? "bg-surface-100 text-surface-900 dark:bg-surface-800 dark:text-surface-0"
    : "text-surface-600 hover:bg-surface-50 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800/60 dark:hover:text-surface-100",
  props.errors[key] === undefined ? "" : "text-red-600! dark:text-red-400!",
];
</script>

<template>
  <div v-if="drafts.length > 0" class="flex flex-col gap-2">
    <div
      class="-m-0.5 flex max-h-[6.75rem] flex-wrap items-center gap-1 overflow-y-auto p-0.5 pointer-coarse:max-h-[8.5rem]"
      role="tablist"
      aria-label="Responses"
      @keydown="moveSelection"
    >
      <button
        :id="tabId(DEFAULT_RESPONSE)"
        type="button"
        role="tab"
        :aria-selected="selected === DEFAULT_RESPONSE"
        :aria-controls="panelId"
        :tabindex="selected === DEFAULT_RESPONSE ? 0 : -1"
        :class="tabClass(DEFAULT_RESPONSE)"
        class="font-sans!"
        v-tooltip.top="'Served when no path matches'"
        @click="emit('select', DEFAULT_RESPONSE)"
      >
        Default
        <span
          v-if="dirty.has(DEFAULT_RESPONSE)"
          class="size-1.5 shrink-0 rounded-full bg-current"
        />
        <span v-if="dirty.has(DEFAULT_RESPONSE)" class="sr-only"
          >, unsaved</span
        >
      </button>
      <button
        v-for="draft in drafts"
        :id="tabId(draft.key)"
        :key="draft.key"
        type="button"
        role="tab"
        :aria-selected="selected === draft.key"
        :aria-controls="panelId"
        :tabindex="selected === draft.key ? 0 : -1"
        :class="tabClass(draft.key)"
        :title="draft.path"
        @click="emit('select', draft.key)"
      >
        <span
          v-if="draft.method"
          class="shrink-0"
          :class="
            selected === draft.key
              ? ''
              : 'text-surface-500 dark:text-surface-400'
          "
          >{{ draft.method }}</span
        >
        <span class="max-w-48 truncate" :class="{ italic: !draft.path.trim() }">
          {{ draft.path.trim() || "empty" }}
        </span>
        <span
          v-if="dirty.has(draft.key)"
          class="size-1.5 shrink-0 rounded-full bg-current"
        />
        <span v-if="dirty.has(draft.key)" class="sr-only">, unsaved</span>
        <span v-if="errors[draft.key]" class="sr-only">, invalid</span>
      </button>
    </div>

    <div v-if="active && editable" class="flex flex-col gap-1">
      <div class="flex items-center gap-1">
        <div
          class="flex h-8 min-w-0 flex-1 items-center rounded-md border bg-white transition-colors dark:bg-surface-950 pointer-coarse:h-10"
          :class="
            activeError === undefined
              ? 'border-surface-300 focus-within:border-primary dark:border-surface-700'
              : 'border-red-500 focus-within:ring-1 focus-within:ring-red-500/40 dark:border-red-400'
          "
        >
          <div
            class="relative flex h-full shrink-0 border-r border-surface-200 dark:border-surface-700"
          >
            <select
              :value="active.method ?? ''"
              aria-label="Method"
              class="h-full cursor-pointer appearance-none rounded-l-md bg-transparent pl-2.5 pr-6 font-mono text-xs text-surface-600 outline-none hover:text-surface-900 focus-visible:bg-surface-100 focus-visible:text-surface-900 dark:focus-visible:bg-surface-800 dark:text-surface-400 dark:[color-scheme:dark] dark:hover:text-surface-100"
              @change="
                emit(
                  'setMethod',
                  active.key,
                  (($event.target as HTMLSelectElement).value || undefined) as
                    RouteMethod | undefined,
                )
              "
            >
              <option value="">ANY</option>
              <option
                v-for="method in ROUTE_METHODS"
                :key="method"
                :value="method"
              >
                {{ method }}
              </option>
            </select>
            <i
              class="pi pi-chevron-down pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px]! text-surface-400! dark:text-surface-500!"
              aria-hidden="true"
            />
          </div>
          <input
            ref="pathInputRef"
            :value="active.path"
            type="text"
            spellcheck="false"
            autocomplete="off"
            aria-label="Path"
            placeholder="/callback"
            :aria-invalid="activeError !== undefined"
            :aria-describedby="activeError ? errorId : undefined"
            class="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-xs text-surface-900 outline-none placeholder:text-surface-400 dark:text-surface-0"
            @input="
              emit(
                'setPath',
                active.key,
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </div>
        <Button
          icon="pi pi-trash"
          severity="secondary"
          text
          size="small"
          class="shrink-0 text-surface-400! hover:text-red-600! pointer-coarse:min-h-10 pointer-coarse:min-w-10"
          aria-label="Remove path response"
          v-tooltip.top="'Remove'"
          @click="handleRemove(active.key)"
        />
      </div>
      <p
        :id="errorId"
        aria-live="polite"
        class="text-xs text-red-600 empty:-mt-1 dark:text-red-400"
      >
        {{ activeError ?? "" }}
      </p>
    </div>
  </div>
</template>
