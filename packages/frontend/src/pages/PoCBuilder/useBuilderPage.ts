import {
  computed,
  inject,
  provide,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";
import { useRouter } from "vue-router";
import { useConfirm } from "primevue/useconfirm";
import type { Instance } from "shared";
import { useNotify } from "@/composables";
import { config } from "@/config";
import { useInstanceDetail } from "@/queries/domains/useInstanceDetail";
import { useUpdateInstance } from "@/queries/domains/useInstances";
import {
  useBuilderStore,
  useResponseEditorStore,
  DEFAULT_TEMPLATE,
  formatResponse,
} from "@/stores";
import { isAbsent, isPresent } from "@/utils/types";

type BuilderPageContext = {
  instance: ComputedRef<Instance | undefined>;
  isLoading: Ref<boolean>;
  isSaving: Ref<boolean>;
  previewUrl: ComputedRef<string | undefined>;
  handleSave: () => Promise<void>;
  handleBack: () => void;
};

const builderPageSymbol: InjectionKey<BuilderPageContext> =
  Symbol("builderPage");

export const useBuilderPage = (instanceIdRef: Ref<string>) => {
  const notify = useNotify();
  const router = useRouter();
  const confirm = useConfirm();
  const builderStore = useBuilderStore();
  const responseEditorStore = useResponseEditorStore();

  const { data, isLoading, error } = useInstanceDetail(instanceIdRef);
  const { mutateAsync: updateInstanceMutation, isPending: isSaving } =
    useUpdateInstance();

  const instance = computed(() => data.value?.instance);

  const previewUrl = computed(() => {
    const inst = instance.value;
    if (isAbsent(inst)) {
      return undefined;
    }
    return config.getInstanceUrl(inst.id);
  });

  responseEditorStore.setContent(DEFAULT_TEMPLATE, "hydrate");

  watch(
    () => responseEditorStore.lastUpdateOrigin,
    (origin) => {
      if (origin === "hydrate") {
        builderStore.isDirty = false;
        return;
      }
      if (origin === "agent" || origin === "user") {
        builderStore.isDirty = true;
      }
    },
    { immediate: true },
  );

  watch(
    error,
    (newError) => {
      if (isAbsent(newError)) {
        return;
      }
      notify.error("Unable to load instance", newError);
      router.push("/");
    },
    { immediate: true },
  );

  watch(
    instance,
    (newInstance) => {
      if (isAbsent(newInstance)) {
        return;
      }
      if (newInstance.kind !== "static") {
        notify.warn(
          "Unsupported instance",
          "PoC Builder is available for static instances only.",
        );
        router.push({ name: "instanceDetail", params: { id: newInstance.id } });
        return;
      }
      if (builderStore.isDirty) {
        return;
      }
      builderStore.hydrateEditor(newInstance.raw);
    },
    { immediate: true },
  );

  const handleSave = async () => {
    const currentInstance = instance.value;
    if (currentInstance?.kind !== "static") {
      return;
    }
    try {
      await updateInstanceMutation({
        id: currentInstance.id,
        input: {
          kind: "static",
          raw: formatResponse(builderStore.editorContent),
          webhookIds: currentInstance.webhookIds,
        },
      });
      builderStore.isDirty = false;
      builderStore.refreshPreview();
      notify.success("PoC saved");
    } catch (err) {
      notify.error("Save failed", err);
    }
  };

  const performNavigation = () => {
    const targetId = instanceIdRef.value;
    if (isPresent(targetId) && targetId !== "") {
      router.push({ name: "instanceDetail", params: { id: targetId } });
    } else {
      router.push("/");
    }
  };

  const handleBack = () => {
    if (builderStore.isDirty) {
      confirm.require({
        message: "You have unsaved changes. Are you sure you want to leave?",
        header: "Unsaved Changes",
        icon: "pi pi-exclamation-triangle",
        rejectProps: {
          label: "Cancel",
          severity: "secondary",
          outlined: true,
        },
        acceptProps: {
          label: "Leave",
          severity: "danger",
        },
        accept: performNavigation,
      });
    } else {
      performNavigation();
    }
  };

  const context: BuilderPageContext = {
    instance,
    isLoading,
    isSaving,
    previewUrl,
    handleSave,
    handleBack,
  };

  return context;
};

export const provideBuilderPage = (context: BuilderPageContext) => {
  provide(builderPageSymbol, context);
};

export const useBuilderPageContext = () => {
  const context = inject(builderPageSymbol);
  if (isAbsent(context)) {
    throw new Error("Builder page context is not available");
  }
  return context;
};
