<script setup lang="ts">
import { ROUTE_METHODS, type RouteMethod } from "shared";
import { computed, nextTick, ref, watch } from "vue";
import { responseSummary, type RouteDraft } from "./responseRoutes";
import { DEFAULT_RESPONSE } from "./useInstanceEditor";

const props = defineProps<{
  drafts: RouteDraft[];
  fallbackRaw: string;
  errors: Record<string, string>;
  dirty: Set<string>;
  selected: string;
  editable: boolean;
  canAdd: boolean;
  baseUrl: string;
  focusPathRequest: number;
  focusTabRequest: number;
}>();

const emit = defineEmits<{
  select: [key: string];
  add: [];
  remove: [key: string];
  upload: [];
  copy: [url: string, unsaved: boolean];
  setPath: [key: string, path: string];
  setMethod: [key: string, method: RouteMethod | undefined];
}>();

type Row = {
  key: string;
  method?: RouteMethod;
  path?: string;
  raw: string;
};

const rows = computed<Row[]>(() => [
  ...props.drafts.map((draft) => ({
    key: draft.key,
    method: draft.method,
    path: draft.path,
    raw: draft.raw,
  })),
  { key: DEFAULT_RESPONSE, raw: props.fallbackRaw },
]);

const rowId = (key: string) => `response-row-${key}`;
const editorId = (key: string) => `response-editor-${key}`;

const isOpen = (row: Row) => props.selected === row.key;
const isEditingPath = (row: Row) =>
  isOpen(row) && props.editable && row.path !== undefined;

const urlFor = (row: Row) =>
  row.path === undefined
    ? props.baseUrl
    : `${props.baseUrl}${row.path.trim().replace(/\*.*$/, "")}`;

const copyLabel = (row: Row) =>
  row.path?.includes("*") === true ? "Copy URL prefix" : "Copy URL";

const pathInputRef = ref<HTMLInputElement | null>(null);
const setPathInputRef = (key: string) => (el: unknown) => {
  if (key === props.selected && el instanceof HTMLInputElement) {
    pathInputRef.value = el;
  }
};

const focusRowToggle = (key: string) =>
  nextTick(() => {
    const row = document.getElementById(rowId(key));
    row?.scrollIntoView({ block: "nearest" });
    row?.querySelector<HTMLElement>("[data-row-toggle]")?.focus();
  });

watch(
  () => props.focusPathRequest,
  () =>
    nextTick(() => {
      const input = pathInputRef.value;
      if (input === null) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.scrollIntoView({ block: "nearest" });
    }),
);

watch(
  () => props.focusTabRequest,
  () => focusRowToggle(props.selected),
);

const handleRemove = (key: string) => {
  emit("remove", key);
  focusRowToggle(props.selected);
};

const focusEditor = (event: KeyboardEvent) =>
  (event.target as HTMLElement)
    .closest("[data-response-row]")
    ?.querySelector<HTMLElement>(".cm-content")
    ?.focus();

const rowBorder = (row: Row, index: number) => {
  if (index === 0) return "";
  if (row.key === DEFAULT_RESPONSE && props.drafts.length > 0) {
    return "border-t border-surface-200 dark:border-surface-700";
  }
  const previous = rows.value[index - 1];
  return previous !== undefined && isOpen(previous)
    ? "border-t border-surface-100 dark:border-surface-800"
    : "";
};

const iconButtonClass =
  "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-surface-400 transition-colors hover:bg-surface-200/70 hover:text-surface-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:text-surface-500 dark:hover:bg-surface-700 dark:hover:text-surface-100";
</script>

<template>
  <div
    class="shrink-0 overflow-hidden rounded-lg border border-surface-200 dark:border-surface-700"
  >
    <div
      v-for="(row, index) in rows"
      :id="rowId(row.key)"
      :key="row.key"
      data-response-row
      :class="rowBorder(row, index)"
    >
      <div
        class="group flex h-11 items-center gap-2 pr-1.5 pl-1 transition-colors sm:h-9 pointer-coarse:h-11"
        :class="
          isOpen(row)
            ? 'bg-surface-50 dark:bg-surface-800/60'
            : 'hover:bg-surface-50 dark:hover:bg-surface-800/40'
        "
      >
        <button
          type="button"
          data-row-toggle
          class="flex h-full min-w-0 items-center gap-2 rounded-md pl-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
          :class="[
            isEditingPath(row) ? 'flex-none pr-0.5' : 'flex-1',
            isOpen(row) ? 'cursor-default' : 'cursor-pointer',
          ]"
          :aria-expanded="isOpen(row)"
          :aria-controls="editorId(row.key)"
          :aria-label="
            row.path === undefined
              ? 'Every other request'
              : `${row.method ?? 'Any method'} ${row.path}`
          "
          @click="emit('select', row.key)"
        >
          <i
            v-if="drafts.length > 0"
            class="pi text-[10px] text-surface-400"
            :class="isOpen(row) ? 'pi-chevron-down' : 'pi-chevron-right'"
            aria-hidden="true"
          />
          <template v-if="!isEditingPath(row)">
            <span
              v-if="row.path === undefined"
              class="min-w-0 truncate text-[13px] text-surface-700 dark:text-surface-300"
              >Every other request</span
            >
            <template v-else>
              <span
                class="w-12 shrink-0 font-mono text-xs"
                :class="
                  row.method === undefined
                    ? 'text-surface-500 dark:text-surface-400'
                    : 'text-surface-800 dark:text-surface-200'
                "
                >{{ row.method ?? "ANY" }}</span
              >
              <span
                class="min-w-0 truncate font-mono text-[13px]"
                :class="
                  errors[row.key]
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-surface-900 dark:text-surface-0'
                "
                :title="row.path.trim()"
                >{{ row.path.trim() || "/" }}</span
              >
            </template>
          </template>
        </button>

        <template v-if="isEditingPath(row)">
          <label class="relative flex h-7 shrink-0 items-center">
            <span class="sr-only">Method</span>
            <select
              :value="row.method ?? ''"
              class="h-7 w-12 cursor-pointer appearance-none rounded-md bg-transparent pr-3.5 font-mono text-xs! text-surface-800 outline-none hover:text-surface-950 focus-visible:ring-2 focus-visible:ring-primary/60 dark:text-surface-200 dark:[color-scheme:dark] dark:hover:text-surface-0"
              @change="
                emit(
                  'setMethod',
                  row.key,
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
              class="pi pi-chevron-down pointer-events-none absolute right-0.5 text-[8px]! text-surface-400!"
              aria-hidden="true"
            />
          </label>
          <input
            :ref="setPathInputRef(row.key)"
            :value="row.path"
            type="text"
            spellcheck="false"
            autocomplete="off"
            aria-label="Path"
            placeholder="/path or /prefix/*"
            :aria-invalid="errors[row.key] !== undefined"
            class="h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 font-mono text-[13px]! outline-none transition-colors placeholder:text-surface-400 focus:bg-white dark:focus:bg-surface-900"
            :class="
              errors[row.key]
                ? 'border-red-400 text-red-600 dark:border-red-500 dark:text-red-400'
                : 'border-surface-200 text-surface-900 focus:border-surface-400 dark:border-surface-700 dark:text-surface-0 dark:focus:border-surface-500'
            "
            @input="
              emit(
                'setPath',
                row.key,
                ($event.target as HTMLInputElement).value,
              )
            "
            @keydown.enter.prevent="focusEditor"
          />
        </template>

        <span
          v-if="!isEditingPath(row) || dirty.has(row.key) || errors[row.key]"
          class="flex min-w-0 shrink items-center justify-end gap-1.5 font-mono text-xs"
          :class="isEditingPath(row) ? '' : 'max-w-[38%]'"
        >
          <span
            v-if="dirty.has(row.key)"
            class="size-1.5 shrink-0 rounded-full bg-amber-500"
            v-tooltip.top="'Unsaved'"
          />
          <span v-if="dirty.has(row.key)" class="sr-only">Unsaved</span>
          <span
            v-if="errors[row.key]"
            class="shrink-0 text-red-600 dark:text-red-400"
            role="alert"
            >{{ errors[row.key] }}</span
          >
          <span
            v-else-if="!isOpen(row)"
            class="min-w-0 truncate text-surface-500 dark:text-surface-400"
            :title="responseSummary(row.raw).detail"
            >{{ responseSummary(row.raw).code }}</span
          >
        </span>

        <div
          class="flex shrink-0 items-center justify-end"
          :class="
            isOpen(row)
              ? 'w-[84px]'
              : 'pointer-events-none hidden w-7 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 sm:flex'
          "
        >
          <button
            v-if="isOpen(row) && editable && row.path !== undefined"
            type="button"
            :class="iconButtonClass"
            class="hover:text-red-600! dark:hover:text-red-400!"
            aria-label="Remove path"
            v-tooltip.top="'Remove path'"
            @click="handleRemove(row.key)"
          >
            <i class="pi pi-trash text-xs" aria-hidden="true" />
          </button>
          <button
            type="button"
            :class="iconButtonClass"
            :aria-label="copyLabel(row)"
            v-tooltip.top="copyLabel(row)"
            @click="emit('copy', urlFor(row), dirty.has(row.key))"
          >
            <i class="pi pi-copy text-xs" aria-hidden="true" />
          </button>
          <button
            v-if="isOpen(row) && editable"
            type="button"
            :class="iconButtonClass"
            aria-label="Upload file into this response"
            v-tooltip.top="'Upload file'"
            @click="emit('upload')"
          >
            <i class="pi pi-upload text-xs" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        v-if="isOpen(row)"
        :id="editorId(row.key)"
        class="h-72 border-t border-surface-100 dark:border-surface-800"
      >
        <slot />
      </div>
    </div>

    <button
      v-if="editable && canAdd"
      type="button"
      class="flex h-11 w-full cursor-pointer items-center gap-2 border-t border-surface-100 pl-3 text-[13px] text-surface-500 transition-colors hover:bg-surface-50 hover:text-surface-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 sm:h-9 dark:border-surface-800 dark:text-surface-400 dark:hover:bg-surface-800/40 dark:hover:text-surface-100 pointer-coarse:h-11"
      @click="emit('add')"
    >
      <i class="pi pi-plus text-[10px]" aria-hidden="true" />
      Add path
    </button>
  </div>
</template>
