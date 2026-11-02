import type { Instance, InstanceRoute, RouteMethod } from "shared";
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { useNotify } from "@/composables";
import { useUpdateInstance } from "@/queries/domains/useInstances";
import { isAbsent } from "@/utils/types";
import {
  canAddRoute,
  createRouteDraft,
  isDraftDirty,
  routeLabel,
  routesEqual,
  toInstanceRoutes,
  toRouteDrafts,
  validateRouteDrafts,
  type RouteDraft,
} from "./responseRoutes";
import { useFileUpload } from "./useFileUpload";

const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");

export const DEFAULT_RESPONSE = "default";

export const useInstanceEditor = (
  instance: Ref<Instance>,
  canManageInstance: ComputedRef<boolean>,
) => {
  const notify = useNotify();
  const { processFile } = useFileUpload();
  const { mutateAsync: updateInstance, isPending: isMutationPending } =
    useUpdateInstance();
  const rawContent = ref("");
  const savedRawContent = ref("");
  const routeDrafts = ref<RouteDraft[]>([]);
  const savedRoutes = ref<InstanceRoute[]>([]);
  const selectedResponse = ref(DEFAULT_RESPONSE);
  const isAdvanced = ref(false);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const selectedWebhookIds = ref<string[]>([]);
  const isSavingRaw = ref(false);
  const isSavingWebhooks = ref(false);
  const isUpdating = computed(
    () =>
      isMutationPending.value || isSavingRaw.value || isSavingWebhooks.value,
  );

  const draftRoutes = computed(() => toInstanceRoutes(routeDrafts.value));
  const routeErrors = computed(() => validateRouteDrafts(routeDrafts.value));
  const isDirty = computed(
    () =>
      normalizeLineEndings(rawContent.value) !==
        normalizeLineEndings(savedRawContent.value) ||
      !routesEqual(draftRoutes.value, savedRoutes.value),
  );
  const canSave = computed(() => isDirty.value && !isUpdating.value);
  const pathFocusRequest = ref(0);

  const dirtyResponses = computed(() => {
    const dirty = new Set<string>();
    if (
      normalizeLineEndings(rawContent.value) !==
      normalizeLineEndings(savedRawContent.value)
    ) {
      dirty.add(DEFAULT_RESPONSE);
    }
    for (const draft of routeDrafts.value) {
      if (isDraftDirty(draft)) {
        dirty.add(draft.key);
      }
    }
    return dirty;
  });

  const activeRoute = computed(() =>
    routeDrafts.value.find((draft) => draft.key === selectedResponse.value),
  );
  const editorContent = computed(
    () => activeRoute.value?.raw ?? rawContent.value,
  );

  const resetRouteDrafts = (routes: InstanceRoute[]) => {
    const selectedLabel =
      activeRoute.value === undefined
        ? undefined
        : routeLabel(activeRoute.value);
    routeDrafts.value = toRouteDrafts(routes);
    selectedResponse.value =
      routeDrafts.value.find((draft) => routeLabel(draft) === selectedLabel)
        ?.key ?? DEFAULT_RESPONSE;
  };

  let activeInstanceId: string | undefined;

  watch(
    instance,
    (newInstance) => {
      const instanceChanged = activeInstanceId !== newInstance.id;
      const wasDirty = isDirty.value;
      activeInstanceId = newInstance.id;
      savedRawContent.value = newInstance.raw;
      savedRoutes.value = newInstance.routes;
      if (instanceChanged) {
        selectedResponse.value = DEFAULT_RESPONSE;
        isAdvanced.value = newInstance.routes.length > 0;
      }
      if (instanceChanged || !wasDirty) {
        rawContent.value = newInstance.raw;
        if (routesEqual(draftRoutes.value, newInstance.routes)) {
          routeDrafts.value = routeDrafts.value.map((draft, index) => ({
            ...draft,
            saved: newInstance.routes[index],
          }));
        } else {
          resetRouteDrafts(newInstance.routes);
        }
        if (newInstance.routes.length > 0) {
          isAdvanced.value = true;
        }
      }
      if (instanceChanged || !isSavingWebhooks.value) {
        selectedWebhookIds.value = [...newInstance.webhookIds];
      }
    },
    { immediate: true },
  );

  const updateDraft = (key: string, update: Partial<RouteDraft>) => {
    routeDrafts.value = routeDrafts.value.map((draft) =>
      draft.key === key ? { ...draft, ...update } : draft,
    );
  };

  const handleEditorChange = (value: string) => {
    if (!canManageInstance.value) return;
    if (activeRoute.value === undefined) {
      rawContent.value = value;
      return;
    }
    updateDraft(activeRoute.value.key, { raw: value });
  };

  const selectResponse = (key: string) => {
    selectedResponse.value =
      key === DEFAULT_RESPONSE ||
      routeDrafts.value.some((draft) => draft.key === key)
        ? key
        : DEFAULT_RESPONSE;
  };

  const tabFocusRequest = ref(0);

  const selectResponseByLabel = (label: string) => {
    const draft =
      routeDrafts.value.find((candidate) => routeLabel(candidate) === label) ??
      routeDrafts.value.find(
        (candidate) =>
          candidate.saved !== undefined &&
          routeLabel(candidate.saved) === label,
      );
    if (draft !== undefined) {
      selectedResponse.value = draft.key;
      tabFocusRequest.value += 1;
    }
  };

  const addRoute = () => {
    if (!canManageInstance.value || !canAddRoute(routeDrafts.value)) return;
    const draft = createRouteDraft(editorContent.value);
    routeDrafts.value = [...routeDrafts.value, draft];
    selectedResponse.value = draft.key;
    pathFocusRequest.value += 1;
    return draft.key;
  };

  const removeRoute = (key: string) => {
    if (!canManageInstance.value) return;
    const index = routeDrafts.value.findIndex((draft) => draft.key === key);
    if (index === -1) return;
    routeDrafts.value = routeDrafts.value.filter((draft) => draft.key !== key);
    if (selectedResponse.value === key) {
      selectedResponse.value =
        routeDrafts.value[Math.min(index, routeDrafts.value.length - 1)]?.key ??
        DEFAULT_RESPONSE;
    }
  };

  const setRoutePath = (key: string, path: string) => {
    if (!canManageInstance.value) return;
    updateDraft(key, { path });
  };

  const setRouteMethod = (key: string, method: RouteMethod | undefined) => {
    if (!canManageInstance.value) return;
    updateDraft(key, { method });
  };

  const handleSave = async () => {
    if (!canManageInstance.value || isUpdating.value) return;
    const firstInvalid = routeDrafts.value.find(
      (draft) => routeErrors.value[draft.key] !== undefined,
    );
    if (firstInvalid !== undefined) {
      selectedResponse.value = firstInvalid.key;
      pathFocusRequest.value += 1;
      return;
    }
    const instanceId = instance.value.id;
    const raw = rawContent.value;
    const routes = draftRoutes.value;
    isSavingRaw.value = true;
    try {
      const updated = await updateInstance({
        id: instanceId,
        input: { raw, routes, webhookIds: selectedWebhookIds.value },
      });
      if (instance.value.id !== instanceId) return;
      savedRawContent.value = updated.raw;
      savedRoutes.value = updated.routes;
      notify.success("Responses saved");
    } catch (error) {
      if (instance.value.id !== instanceId) return;
      notify.error("Update failed", error);
    } finally {
      isSavingRaw.value = false;
    }
  };

  const handleWebhookChange = async (webhookIds: string[]) => {
    if (!canManageInstance.value || isUpdating.value) return;
    const instanceId = instance.value.id;
    const previousIds = [...selectedWebhookIds.value];
    selectedWebhookIds.value = [...webhookIds];
    isSavingWebhooks.value = true;
    try {
      const updated = await updateInstance({
        id: instanceId,
        input: { raw: savedRawContent.value, webhookIds },
      });
      if (instance.value.id !== instanceId) return;
      selectedWebhookIds.value = [...updated.webhookIds];
    } catch (error) {
      if (instance.value.id !== instanceId) return;
      selectedWebhookIds.value = previousIds;
      notify.error("Failed to update webhooks", error);
    } finally {
      isSavingWebhooks.value = false;
    }
  };

  const discardChanges = () => {
    rawContent.value = savedRawContent.value;
    resetRouteDrafts(savedRoutes.value);
    isAdvanced.value = savedRoutes.value.length > 0;
  };

  const enterAdvanced = () => {
    isAdvanced.value = true;
  };

  const enterBasic = () => {
    if (!canManageInstance.value) return;
    routeDrafts.value = [];
    selectedResponse.value = DEFAULT_RESPONSE;
    isAdvanced.value = false;
  };

  const triggerFileUpload = () => fileInputRef.value?.click();

  const handleFileUpload = async (event: Event) => {
    if (!canManageInstance.value) return;
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (isAbsent(file)) return;
    try {
      handleEditorChange(await processFile(file));
    } catch (error) {
      notify.error("Failed to process file", error);
    } finally {
      target.value = "";
    }
  };

  return {
    rawContent,
    editorContent,
    routeDrafts,
    routeErrors,
    selectedResponse,
    activeRoute,
    isDirty,
    canSave,
    dirtyResponses,
    pathFocusRequest,
    tabFocusRequest,
    isUpdating,
    fileInputRef,
    selectedWebhookIds,
    handleSave,
    handleEditorChange,
    handleWebhookChange,
    selectResponse,
    selectResponseByLabel,
    discardChanges,
    isAdvanced,
    enterAdvanced,
    enterBasic,
    addRoute,
    removeRoute,
    setRoutePath,
    setRouteMethod,
    canAddRoute: computed(() => canAddRoute(routeDrafts.value)),
    triggerFileUpload,
    handleFileUpload,
  };
};
