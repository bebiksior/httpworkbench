<script setup lang="ts">
import type { Instance, Log } from "shared";
import { computed, nextTick, ref, toRefs, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { HttpEditor } from "@/components/HttpEditor";
import { config } from "@/config";
import { routeLabel, routeUrl, statusCode } from "../../responseRoutes";
import { useResponsesEditor } from "../../useResponsesEditor";
import { useUnsavedChanges } from "../../useUnsavedChanges";
import { ServedBar } from "../ServedBar";
import { Sidebar } from "../Sidebar";
import { Toolbar } from "../Toolbar";

const props = defineProps<{ instance: Instance; logs: Log[] }>();
const { instance } = toRefs(props);

const route = useRoute();
const router = useRouter();
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
const toolbar = ref<InstanceType<typeof Toolbar>>();

const url = computed(() =>
  routeUrl(config.getInstanceUrl(instance.value.id), activeRoute.value?.path),
);
const activeError = computed(() =>
  activeRoute.value === undefined
    ? undefined
    : errors.value[activeRoute.value.key],
);
const servedLabel = computed(() => {
  const draft = activeRoute.value;
  return draft === undefined ? undefined : routeLabel(draft.saved ?? draft);
});

const focusPath = async () => {
  await nextTick();
  toolbar.value?.focusPath();
};

const handleAdd = (path?: string) => {
  if (add(path) !== undefined) {
    void focusPath();
  }
};

const handleSave = async () => {
  const saved = await save();
  if (!saved && activeError.value !== undefined) {
    void focusPath();
  }
};

const withActiveKey = (apply: (key: string) => void) => {
  if (activeRoute.value !== undefined) apply(activeRoute.value.key);
};

const goToInstance = (query: Record<string, string> = {}) => {
  void router.push({
    name: "instanceDetail",
    params: { id: instance.value.id },
    query,
  });
};

const showInLogs = () => {
  goToInstance(
    servedLabel.value === undefined ? {} : { search: servedLabel.value },
  );
};

watch(
  () => route.query.route,
  (label) => {
    if (typeof label === "string" && label !== "") {
      selectByLabel(label);
    }
  },
  { immediate: true },
);

useUnsavedChanges({ isDirty, discard, save: handleSave });
</script>

<template>
  <div
    class="flex h-full flex-col overflow-hidden rounded-lg bg-white lg:flex-row dark:bg-surface-900"
  >
    <Sidebar
      :rows="rows"
      :errors="errors"
      :selected="selected"
      :fallback-status="statusCode(fallbackRaw)"
      :can-add="canAdd"
      @select="select"
      @add="handleAdd"
    />

    <section class="flex min-h-0 min-w-0 flex-1 flex-col">
      <Toolbar
        ref="toolbar"
        :route="activeRoute"
        :error="activeError"
        :url="url"
        :is-dirty="isDirty"
        :can-save="canSave"
        :is-updating="isUpdating"
        @method="withActiveKey((key) => setMethod(key, $event))"
        @path="withActiveKey((key) => setPath(key, $event))"
        @content="setContent"
        @remove="withActiveKey(remove)"
        @save="handleSave"
        @close="goToInstance()"
      />

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

      <ServedBar :logs="logs" :label="servedLabel" @show-logs="showInLogs" />
    </section>
  </div>
</template>
