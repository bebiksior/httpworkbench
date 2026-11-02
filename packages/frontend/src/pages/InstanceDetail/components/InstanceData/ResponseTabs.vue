<script setup lang="ts">
import { ROUTE_METHODS, type RouteMethod } from "shared";
import { computed, nextTick, ref, watch } from "vue";
import { statusLineOf, type RouteDraft } from "./responseRoutes";
import { DEFAULT_RESPONSE } from "./useInstanceEditor";

const props = defineProps<{
  drafts: RouteDraft[];
  fallbackRaw: string;
  errors: Record<string, string>;
  dirty: Set<string>;
  selected: string;
  editable: boolean;
  canAdd: boolean;
  focusPathRequest: number;
  focusTabRequest: number;
}>();

const emit = defineEmits<{
  select: [key: string];
  add: [];
  remove: [key: string];
  setPath: [key: string, path: string];
  setMethod: [key: string, method: RouteMethod | undefined];
}>();

const panelId = "response-panel";
const tabId = (key: string) => `response-tab-${key}`;
const errorId = "response-path-error";

const tabs = computed(() => [
  {
    key: DEFAULT_RESPONSE,
    method: undefined,
    label: "Fallback",
    status: statusLineOf(props.fallbackRaw),
  },
  ...props.drafts.map((draft) => ({
    key: draft.key,
    method: draft.method,
    label: draft.path.trim(),
    status: statusLineOf(draft.raw),
  })),
]);
const active = computed(() =>
  props.drafts.find((draft) => draft.key === props.selected),
);
const activeError = computed(() =>
  active.value === undefined ? undefined : props.errors[active.value.key],
);

const pathInputRef = ref<HTMLInputElement | null>(null);

const revealTab = (key: string, focus: boolean) =>
  nextTick(() => {
    const tab = document.getElementById(tabId(key));
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focus) tab?.focus();
  });

watch(
  () => props.selected,
  (key) => revealTab(key, false),
);
watch(
  () => props.focusTabRequest,
  () => revealTab(props.selected, true),
);
watch(
  () => props.focusPathRequest,
  () =>
    nextTick(() => {
      pathInputRef.value?.focus();
      pathInputRef.value?.select();
    }),
);

const handleRemove = (key: string) => {
  emit("remove", key);
  revealTab(props.selected, true);
};

const moveSelection = (event: KeyboardEvent) => {
  const keys = tabs.value.map((tab) => tab.key);
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
  revealTab(next, true);
};

const scrollTabsHorizontally = (event: WheelEvent) => {
  const strip = event.currentTarget;
  if (
    !(strip instanceof HTMLElement) ||
    strip.scrollWidth <= strip.clientWidth ||
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
  ) {
    return;
  }
  strip.scrollLeft += event.deltaY;
  event.preventDefault();
};

const statusTone = (code: string | undefined) => {
  switch (code?.[0]) {
    case "2":
      return "bg-emerald-500";
    case "3":
      return "bg-sky-500";
    case "4":
      return "bg-amber-500";
    case "5":
      return "bg-red-500";
    default:
      return "bg-surface-400";
  }
};

const fieldClass =
  "h-7 rounded-md border bg-white font-mono text-xs text-surface-900 outline-none transition-colors focus:border-surface-500 dark:bg-surface-900 dark:text-surface-0 dark:focus:border-surface-400";
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-surface-200 dark:border-surface-700"
  >
    <div
      class="flex shrink-0 border-b border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900"
    >
      <div
        class="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]"
        role="tablist"
        aria-label="Responses"
        @keydown="moveSelection"
        @wheel="scrollTabsHorizontally"
      >
        <button
          v-for="tab in tabs"
          :id="tabId(tab.key)"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="selected === tab.key"
          :aria-controls="panelId"
          :tabindex="selected === tab.key ? 0 : -1"
          :title="tab.method ? `${tab.method} ${tab.label}` : tab.label"
          class="relative -mb-px flex min-w-24 max-w-48 shrink-0 cursor-pointer flex-col items-start gap-0.5 border-r border-b border-surface-200 px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 dark:border-surface-700"
          :class="
            selected === tab.key
              ? 'border-b-white bg-white text-surface-900 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary dark:border-b-[#282c34] dark:bg-[#282c34] dark:text-surface-0'
              : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-100'
          "
          @click="emit('select', tab.key)"
        >
          <span
            class="flex w-full min-w-0 items-center gap-1.5 text-xs font-medium"
            :class="[
              tab.key === DEFAULT_RESPONSE ? '' : 'font-mono',
              errors[tab.key] ? 'text-red-600 dark:text-red-400' : '',
            ]"
          >
            <span
              v-if="tab.method"
              class="shrink-0 text-surface-500 dark:text-surface-400"
              >{{ tab.method }}</span
            >
            <span class="min-w-0 truncate" :class="{ italic: !tab.label }">{{
              tab.label || "no path"
            }}</span>
            <span
              v-if="dirty.has(tab.key)"
              class="ml-auto size-1.5 shrink-0 rounded-full bg-current"
            />
            <span v-if="dirty.has(tab.key)" class="sr-only">, unsaved</span>
            <span v-if="errors[tab.key]" class="sr-only">, invalid</span>
          </span>
          <span
            class="flex w-full min-w-0 items-center gap-1.5 text-[11px] text-surface-500 dark:text-surface-400"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="statusTone(tab.status?.code)"
            />
            <span class="truncate">{{
              tab.status === undefined
                ? "Invalid response"
                : `${tab.status.code} ${tab.status.reason}`.trim()
            }}</span>
          </span>
        </button>
      </div>
      <button
        v-if="editable"
        type="button"
        class="flex w-10 shrink-0 cursor-pointer items-center justify-center border-l border-surface-200 text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 dark:border-surface-700 dark:hover:bg-surface-800 dark:hover:text-surface-100"
        :aria-disabled="!canAdd"
        aria-label="Add path response"
        v-tooltip.top="canAdd ? 'Add path' : 'Path limit reached'"
        @click="canAdd && emit('add')"
      >
        <i class="pi pi-plus text-xs" aria-hidden="true" />
      </button>
    </div>

    <div
      class="flex min-h-10 shrink-0 items-center gap-2 border-b border-surface-200 px-2 py-1.5 dark:border-surface-700 dark:bg-[#282c34]"
    >
      <template v-if="active && editable">
        <select
          :value="active.method ?? ''"
          aria-label="Method"
          :class="fieldClass"
          class="w-auto shrink-0 cursor-pointer border-surface-300 px-1.5 dark:border-surface-700 dark:[color-scheme:dark]"
          @change="
            emit(
              'setMethod',
              active.key,
              (($event.target as HTMLSelectElement).value || undefined) as
                RouteMethod | undefined,
            )
          "
        >
          <option value="">Any</option>
          <option v-for="method in ROUTE_METHODS" :key="method" :value="method">
            {{ method }}
          </option>
        </select>
        <input
          ref="pathInputRef"
          :value="active.path"
          type="text"
          spellcheck="false"
          autocomplete="off"
          aria-label="Path"
          placeholder="/callback or /assets/*"
          :aria-invalid="activeError !== undefined"
          :aria-describedby="activeError ? errorId : undefined"
          :class="[
            fieldClass,
            activeError === undefined
              ? 'border-surface-300 dark:border-surface-700'
              : 'border-red-500! dark:border-red-400!',
          ]"
          class="min-w-0 flex-1 px-2 placeholder:text-surface-400"
          @input="
            emit(
              'setPath',
              active.key,
              ($event.target as HTMLInputElement).value,
            )
          "
        />
        <button
          type="button"
          class="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-surface-400 transition-colors hover:bg-surface-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-surface-800"
          aria-label="Remove path response"
          v-tooltip.top="'Remove path'"
          @click="handleRemove(active.key)"
        >
          <i class="pi pi-trash text-xs" aria-hidden="true" />
        </button>
      </template>
      <p
        v-else-if="active"
        class="px-1 font-mono text-xs text-surface-700 dark:text-surface-300"
      >
        {{ active.method ?? "Any" }} {{ active.path }}
      </p>
      <p v-else class="px-1 text-xs text-surface-500 dark:text-surface-400">
        Served for any request that doesn't match a path tab.
      </p>
    </div>
    <p
      :id="errorId"
      aria-live="polite"
      class="shrink-0 border-b border-surface-200 px-3 py-1 text-xs text-red-600 empty:hidden dark:border-surface-700 dark:text-red-400"
    >
      {{ activeError ?? "" }}
    </p>

    <div
      :id="panelId"
      role="tabpanel"
      :aria-labelledby="tabId(selected)"
      class="min-h-0 flex-1"
    >
      <slot />
    </div>
  </div>
</template>
