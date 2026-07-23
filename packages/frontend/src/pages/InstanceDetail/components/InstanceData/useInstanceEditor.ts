import type { Instance } from "shared";
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { useNotify } from "@/composables";
import { useUpdateInstance } from "@/queries/domains/useInstances";
import { isAbsent } from "@/utils/types";
import { useFileUpload } from "./useFileUpload";

const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");

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
  const isDirty = ref(false);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const selectedWebhookIds = ref<string[]>([]);
  const isSavingRaw = ref(false);
  const isSavingWebhooks = ref(false);
  const isUpdating = computed(
    () =>
      isMutationPending.value || isSavingRaw.value || isSavingWebhooks.value,
  );

  const hasUnsavedRawChanges = (value: string) =>
    normalizeLineEndings(value) !== normalizeLineEndings(savedRawContent.value);

  let activeInstanceId: string | undefined;

  watch(
    instance,
    (newInstance) => {
      const instanceChanged = activeInstanceId !== newInstance.id;
      activeInstanceId = newInstance.id;
      savedRawContent.value = newInstance.raw;
      if (instanceChanged || !isDirty.value) {
        rawContent.value = newInstance.raw;
      }
      isDirty.value = hasUnsavedRawChanges(rawContent.value);
      if (instanceChanged || !isSavingWebhooks.value) {
        selectedWebhookIds.value = [...newInstance.webhookIds];
      }
    },
    { immediate: true },
  );

  const handleEditorChange = (value: string) => {
    if (!canManageInstance.value) return;
    rawContent.value = value;
    isDirty.value = hasUnsavedRawChanges(value);
  };

  const handleSave = async () => {
    if (!canManageInstance.value || isUpdating.value) return;
    const instanceId = instance.value.id;
    const raw = rawContent.value;
    isSavingRaw.value = true;
    try {
      const updated = await updateInstance({
        id: instanceId,
        input: { raw, webhookIds: selectedWebhookIds.value },
      });
      if (instance.value.id !== instanceId) return;
      savedRawContent.value = updated.raw;
      isDirty.value = hasUnsavedRawChanges(rawContent.value);
      notify.success("Raw response updated");
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
    isDirty,
    isUpdating,
    fileInputRef,
    selectedWebhookIds,
    handleSave,
    handleEditorChange,
    handleWebhookChange,
    triggerFileUpload,
    handleFileUpload,
  };
};
