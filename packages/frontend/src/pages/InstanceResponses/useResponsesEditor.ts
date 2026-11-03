import type { Instance, InstanceRoute, RouteMethod } from "shared";
import { computed, ref, watch, type Ref } from "vue";
import { useNotify } from "@/composables";
import { useUpdateInstance } from "@/queries/domains/useInstances";
import {
  arrangeByOrder,
  canAddRoute,
  createRouteDraft,
  priorityOrder,
  routeLabel,
  routesEqual,
  toInstanceRoutes,
  toRouteDrafts,
  validateRouteDrafts,
  type RouteDraft,
} from "./responseRoutes";

export const FALLBACK_KEY = "default";

const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");

export const useResponsesEditor = (instance: Ref<Instance>) => {
  const notify = useNotify();
  const { mutateAsync: updateInstance, isPending } = useUpdateInstance();

  const fallbackRaw = ref("");
  const savedFallbackRaw = ref("");
  const drafts = ref<RouteDraft[]>([]);
  const savedRoutes = ref<InstanceRoute[]>([]);
  const selected = ref(FALLBACK_KEY);
  const rowOrder = ref<string[]>([]);
  const isSaving = ref(false);
  const isUpdating = computed(() => isPending.value || isSaving.value);

  const draftRoutes = computed(() => toInstanceRoutes(drafts.value));
  const errors = computed(() => validateRouteDrafts(drafts.value));
  const hasErrors = computed(() => Object.keys(errors.value).length > 0);
  const isDirty = computed(
    () =>
      normalizeLineEndings(fallbackRaw.value) !==
        normalizeLineEndings(savedFallbackRaw.value) ||
      !routesEqual(draftRoutes.value, savedRoutes.value),
  );
  const canSave = computed(
    () => isDirty.value && !hasErrors.value && !isUpdating.value,
  );

  const rows = computed(() => arrangeByOrder(drafts.value, rowOrder.value));
  const activeRoute = computed(() =>
    drafts.value.find((draft) => draft.key === selected.value),
  );
  const editorContent = computed(
    () => activeRoute.value?.raw ?? fallbackRaw.value,
  );
  const canAdd = computed(() => canAddRoute(drafts.value));

  const reorder = () => {
    rowOrder.value = priorityOrder(drafts.value);
  };

  watch(selected, reorder);
  watch(() => drafts.value.map((draft) => draft.key).join(), reorder);

  const findByLabel = (label: string) =>
    drafts.value.find((draft) => routeLabel(draft) === label) ??
    drafts.value.find(
      (draft) => draft.saved !== undefined && routeLabel(draft.saved) === label,
    );

  const resetDrafts = (routes: InstanceRoute[]) => {
    const selectedLabel =
      activeRoute.value === undefined
        ? undefined
        : routeLabel(activeRoute.value);
    drafts.value = toRouteDrafts(routes);
    selected.value =
      selectedLabel === undefined
        ? FALLBACK_KEY
        : (findByLabel(selectedLabel)?.key ?? FALLBACK_KEY);
    reorder();
  };

  let activeInstanceId: string | undefined;

  watch(
    instance,
    (next) => {
      const instanceChanged = activeInstanceId !== next.id;
      const wasDirty = isDirty.value;
      activeInstanceId = next.id;
      savedFallbackRaw.value = next.raw;
      savedRoutes.value = next.routes;
      if (instanceChanged) {
        selected.value = FALLBACK_KEY;
      }
      if (!instanceChanged && wasDirty) {
        return;
      }
      fallbackRaw.value = next.raw;
      if (!instanceChanged && routesEqual(draftRoutes.value, next.routes)) {
        drafts.value = drafts.value.map((draft, index) => ({
          ...draft,
          saved: next.routes[index],
        }));
        return;
      }
      resetDrafts(next.routes);
    },
    { immediate: true },
  );

  const updateDraft = (key: string, update: Partial<RouteDraft>) => {
    drafts.value = drafts.value.map((draft) =>
      draft.key === key ? { ...draft, ...update } : draft,
    );
  };

  const setContent = (value: string) => {
    if (activeRoute.value === undefined) {
      fallbackRaw.value = value;
      return;
    }
    updateDraft(activeRoute.value.key, { raw: value });
  };

  const select = (key: string) => {
    selected.value =
      key === FALLBACK_KEY || drafts.value.some((draft) => draft.key === key)
        ? key
        : FALLBACK_KEY;
  };

  const selectByLabel = (label: string) => {
    const draft = findByLabel(label);
    if (draft === undefined) return false;
    selected.value = draft.key;
    return true;
  };

  const add = (path?: string) => {
    if (!canAdd.value) return undefined;
    const draft = createRouteDraft(editorContent.value, path);
    drafts.value = [...drafts.value, draft];
    selected.value = draft.key;
    return draft.key;
  };

  const remove = (key: string) => {
    const index = rows.value.findIndex((draft) => draft.key === key);
    if (index === -1) return;
    const neighbour =
      rows.value[index + 1]?.key ?? rows.value[index - 1]?.key ?? FALLBACK_KEY;
    drafts.value = drafts.value.filter((draft) => draft.key !== key);
    if (selected.value === key) {
      selected.value = neighbour;
    }
  };

  const setPath = (key: string, path: string) => updateDraft(key, { path });

  const setMethod = (key: string, method: RouteMethod | undefined) =>
    updateDraft(key, { method });

  const firstInvalidKey = computed(
    () =>
      rows.value.find((draft) => errors.value[draft.key] !== undefined)?.key,
  );

  const save = async () => {
    if (isUpdating.value || !isDirty.value) return false;
    if (firstInvalidKey.value !== undefined) {
      selected.value = firstInvalidKey.value;
      return false;
    }
    const instanceId = instance.value.id;
    const raw = fallbackRaw.value;
    const routes = draftRoutes.value;
    const sentKeys = drafts.value.map((draft) => draft.key);
    isSaving.value = true;
    try {
      const updated = await updateInstance({
        id: instanceId,
        input: { raw, routes },
      });
      if (instance.value.id !== instanceId) return false;
      savedFallbackRaw.value = updated.raw;
      savedRoutes.value = updated.routes;
      const savedByKey = new Map(
        sentKeys.map((key, index) => [key, updated.routes[index]]),
      );
      drafts.value = drafts.value.map((draft) =>
        savedByKey.has(draft.key)
          ? { ...draft, saved: savedByKey.get(draft.key) }
          : draft,
      );
      reorder();
      notify.success("Responses saved");
      return true;
    } catch (error) {
      if (instance.value.id === instanceId) {
        notify.error("Save failed", error);
      }
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  const discard = () => {
    fallbackRaw.value = savedFallbackRaw.value;
    resetDrafts(savedRoutes.value);
  };

  return {
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
  };
};
