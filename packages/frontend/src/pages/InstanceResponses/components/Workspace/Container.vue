<script setup lang="ts">
import Button from "primevue/button";
import { useConfirm } from "primevue/useconfirm";
import {
  MAX_INSTANCE_ROUTES,
  ROUTE_METHODS,
  type Instance,
  type Log,
  type RouteMethod,
} from "shared";
import { computed, nextTick, ref, toRefs, watch } from "vue";
import { useEventListener, useTimeAgo } from "@vueuse/core";
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from "vue-router";
import { HttpEditor } from "@/components/HttpEditor";
import { useNotify } from "@/composables";
import { config } from "@/config";
import { useFileUpload } from "@/pages/InstanceDetail/components/InstanceData/useFileUpload";
import { createLeaveGuard } from "@/pages/PoCBuilder/exitBuilder";
import {
  adjacentKey,
  routeLabel,
  routeUrl,
  servedStats,
  statusCode,
} from "../../responseRoutes";
import { FALLBACK_KEY, useResponsesEditor } from "../../useResponsesEditor";
import { PathRow } from "../PathRow";

const props = defineProps<{ instance: Instance; logs: Log[] }>();
const { instance, logs } = toRefs(props);

const route = useRoute();
const router = useRouter();
const notify = useNotify();
const confirm = useConfirm();
const { processFile } = useFileUpload();

const {
  fallbackRaw,
  rows,
  errors,
  selected,
  activeRoute,
  editorContent,
  isDirty,
  canSave,
  canAdd,
  isUpdating,
  setContent,
  select,
  selectByLabel,
  add,
  remove,
  setPath,
  setMethod,
  save,
  discard,
} = useResponsesEditor(instance);

const listRef = ref<HTMLElement>();
const pathInputRef = ref<HTMLInputElement>();
const fileInputRef = ref<HTMLInputElement>();

const baseUrl = computed(() => config.getInstanceUrl(instance.value.id));
const url = computed(() => routeUrl(baseUrl.value, activeRoute.value?.path));
const activeError = computed(() =>
  activeRoute.value === undefined
    ? undefined
    : errors.value[activeRoute.value.key],
);
const fallbackStatus = computed(() => statusCode(fallbackRaw.value));
const methodWidth = computed(
  () => `${(activeRoute.value?.method ?? "*").length + 4}ch`,
);

const servedLabel = computed(() => {
  const draft = activeRoute.value;
  if (draft === undefined) return undefined;
  return routeLabel(draft.saved ?? draft);
});
const served = computed(() => servedStats(logs.value, servedLabel.value));
const lastServedAgo = useTimeAgo(
  computed(() => served.value.lastAt ?? Date.now()),
);

const listKeys = computed(() => [
  FALLBACK_KEY,
  ...rows.value.map((draft) => draft.key),
]);

const focusRow = async (key: string) => {
  await nextTick();
  listRef.value
    ?.querySelector<HTMLElement>(`[data-route-key="${key}"]`)
    ?.focus();
};

const onListKeydown = (event: KeyboardEvent) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const next = adjacentKey(
    listKeys.value,
    selected.value,
    event.key === "ArrowDown" ? 1 : -1,
  );
  select(next);
  void focusRow(next);
};

const focusPathInput = async () => {
  await nextTick();
  pathInputRef.value?.focus();
  pathInputRef.value?.select();
};

const handleAdd = (path?: string) => {
  if (add(path) !== undefined) {
    void focusPathInput();
  }
};

const handleSave = async () => {
  const saved = await save();
  if (!saved && activeError.value !== undefined) {
    void focusPathInput();
  }
};

const onMethodChange = (event: Event) => {
  if (activeRoute.value === undefined) return;
  const value = (event.target as HTMLSelectElement).value;
  setMethod(
    activeRoute.value.key,
    value === "" ? undefined : (value as RouteMethod),
  );
};

const onPathInput = (event: Event) => {
  if (activeRoute.value === undefined) return;
  setPath(activeRoute.value.key, (event.target as HTMLInputElement).value);
};

const copyUrl = async () => {
  await navigator.clipboard.writeText(url.value);
  if (
    activeRoute.value !== undefined &&
    activeRoute.value.saved === undefined
  ) {
    notify.success("Copied. Save to make this path live");
    return;
  }
  notify.copied();
};

const openUrl = () => {
  window.open(url.value, "_blank", "noopener");
};

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file === undefined) return;
  try {
    setContent(await processFile(file));
  } catch (error) {
    notify.error("Failed to process file", error);
  } finally {
    target.value = "";
  }
};

const backToInstance = () => {
  router.push({ name: "instanceDetail", params: { id: instance.value.id } });
};

const showInLogs = () => {
  router.push({
    name: "instanceDetail",
    params: { id: instance.value.id },
    query: servedLabel.value === undefined ? {} : { search: servedLabel.value },
  });
};

const examples = ["/login", "/api/*", "/*.js"];

watch(
  () => route.query.route,
  (label) => {
    if (typeof label === "string" && label !== "") {
      selectByLabel(label);
    }
  },
  { immediate: true },
);

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (
    event.defaultPrevented ||
    !(event.metaKey || event.ctrlKey) ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== "s"
  ) {
    return;
  }
  event.preventDefault();
  void handleSave();
});

useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (isDirty.value) {
    event.preventDefault();
  }
});

const leaveGuard = createLeaveGuard({
  isDirty: () => isDirty.value,
  markClean: discard,
  confirmLeave: (accept) => {
    confirm.require({
      message: "You have unsaved response changes. Leave without saving?",
      header: "Unsaved Changes",
      icon: "pi pi-exclamation-triangle",
      rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
      acceptProps: { label: "Leave", severity: "danger" },
      accept,
    });
  },
  navigate: (target) => {
    router.push(target);
  },
});

onBeforeRouteLeave((to, _from, next) => leaveGuard(to, next));
onBeforeRouteUpdate((to, from, next) =>
  to.params.id === from.params.id ? next() : leaveGuard(to, next),
);
</script>

<template>
  <div
    class="flex h-full flex-col overflow-hidden rounded-lg bg-white lg:flex-row dark:bg-surface-900"
  >
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
          @click="handleAdd()"
        />
      </div>

      <div
        ref="listRef"
        class="flex min-h-0 flex-1 flex-col"
        role="listbox"
        aria-label="Paths"
        @keydown="onListKeydown"
      >
        <button
          type="button"
          role="option"
          :aria-selected="selected === FALLBACK_KEY"
          :tabindex="selected === FALLBACK_KEY ? 0 : -1"
          :data-route-key="FALLBACK_KEY"
          class="flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 border-b border-surface-200 px-3 text-left text-[13px] outline-none transition-colors focus-visible:bg-surface-100 dark:border-surface-800 dark:focus-visible:bg-surface-800"
          :class="
            selected === FALLBACK_KEY
              ? 'bg-surface-100 text-surface-950 dark:bg-surface-800 dark:text-surface-0'
              : 'text-surface-500 hover:bg-surface-50 dark:text-surface-400 dark:hover:bg-surface-800/40'
          "
          @click="select(FALLBACK_KEY)"
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
            @select="select(draft.key)"
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
                @click="handleAdd(example)"
              >
                {{ example }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <section class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        class="flex h-10 shrink-0 items-center gap-1 border-b border-surface-200 px-2 dark:border-surface-800"
      >
        <template v-if="activeRoute">
          <label class="relative flex h-7 shrink-0 items-center">
            <select
              :value="activeRoute.method ?? ''"
              aria-label="Method"
              :style="{ width: methodWidth }"
              class="h-7 cursor-pointer appearance-none rounded-sm bg-transparent pr-5 pl-2 font-mono text-xs! text-surface-700 outline-none transition-colors hover:bg-surface-100 focus-visible:bg-surface-100 dark:text-surface-300 dark:[color-scheme:dark] dark:hover:bg-surface-800 dark:focus-visible:bg-surface-800"
              @change="onMethodChange"
            >
              <option value="">*</option>
              <option
                v-for="method in ROUTE_METHODS"
                :key="method"
                :value="method"
              >
                {{ method }}
              </option>
            </select>
            <i
              class="pi pi-chevron-down pointer-events-none absolute right-1.5 text-[8px]! text-surface-400!"
            />
          </label>
          <input
            ref="pathInputRef"
            :value="activeRoute.path"
            type="text"
            spellcheck="false"
            autocomplete="off"
            aria-label="Path"
            :aria-invalid="activeError !== undefined"
            placeholder="/path or /prefix/*"
            class="h-7 w-72 min-w-0 shrink rounded-sm bg-transparent px-2 font-mono text-[13px]! outline-none transition-colors placeholder:text-surface-400 hover:bg-surface-100 focus:bg-surface-100 dark:hover:bg-surface-800 dark:focus:bg-surface-800"
            :class="
              activeError === undefined
                ? 'text-surface-900 dark:text-surface-0'
                : 'text-red-600 dark:text-red-400'
            "
            @input="onPathInput"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <span
            v-if="activeError"
            class="shrink-0 text-xs text-red-600 dark:text-red-400"
          >
            {{ activeError }}
          </span>
        </template>
        <span
          v-else
          class="flex h-7 items-center pl-2 text-[13px] text-surface-900 dark:text-surface-0"
        >
          Default
        </span>

        <div class="flex min-w-0 flex-1 items-center justify-end gap-1">
          <span
            class="hidden min-w-0 truncate font-mono text-xs text-surface-400 md:inline dark:text-surface-500"
            :title="url"
          >
            {{ url }}
          </span>
          <Button
            icon="pi pi-copy"
            severity="secondary"
            text
            size="small"
            class="h-8! w-8! shrink-0 p-0!"
            aria-label="Copy URL"
            v-tooltip.top="'Copy URL'"
            @click="copyUrl"
          />
          <Button
            icon="pi pi-external-link"
            severity="secondary"
            text
            size="small"
            class="h-8! w-8! shrink-0 p-0!"
            aria-label="Open in new tab"
            v-tooltip.top="'Open in new tab'"
            @click="openUrl"
          />
          <input
            ref="fileInputRef"
            type="file"
            class="hidden"
            accept=".txt,.json,.xml,.html,.js,.css,.svg"
            @change="handleFileUpload"
          />
          <Button
            icon="pi pi-upload"
            severity="secondary"
            text
            size="small"
            class="h-8! w-8! shrink-0 p-0!"
            aria-label="Upload file as response"
            v-tooltip.top="'Upload file as response'"
            @click="fileInputRef?.click()"
          />
          <Button
            v-if="activeRoute"
            icon="pi pi-trash"
            severity="secondary"
            text
            size="small"
            class="h-8! w-8! shrink-0 p-0! hover:text-red-600! dark:hover:text-red-400!"
            aria-label="Remove path"
            v-tooltip.top="'Remove path'"
            @click="remove(activeRoute.key)"
          />
        </div>

        <span
          class="mx-1 h-4 w-px shrink-0 bg-surface-200 dark:bg-surface-800"
        />
        <Button
          label="Save"
          :severity="isDirty ? 'primary' : 'secondary'"
          size="small"
          :disabled="!canSave"
          :loading="isUpdating"
          class="h-7! shrink-0 px-2.5! text-xs!"
          v-tooltip.top="'Save (⌘S)'"
          @click="handleSave"
        />
        <Button
          icon="pi pi-times"
          severity="secondary"
          text
          size="small"
          class="h-7! w-7! shrink-0 p-0! text-xs!"
          aria-label="Close"
          v-tooltip.top="'Close'"
          @click="backToInstance"
        />
      </div>

      <div class="min-h-0 flex-1">
        <HttpEditor
          :key="selected"
          :model-value="editorContent"
          :is-dirty="canSave"
          :aria-label="
            activeRoute
              ? `Response for ${activeRoute.path}`
              : 'Default response'
          "
          syntax="response"
          flush
          @update:model-value="setContent"
          @save="handleSave"
        />
      </div>

      <div
        class="flex h-8 shrink-0 items-center justify-between border-t border-surface-200 px-3 text-xs text-surface-400 dark:border-surface-800 dark:text-surface-500"
      >
        <span v-if="served.count === 0">No recent requests</span>
        <span v-else>
          Served {{ served.count }}
          {{ served.count === 1 ? "request" : "requests" }}, last
          {{ lastServedAgo }}
        </span>
        <button
          v-if="served.count > 0"
          type="button"
          class="cursor-pointer text-surface-500 transition-colors hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100"
          @click="showInLogs"
        >
          Show in logs
        </button>
      </div>
    </section>
  </div>
</template>
