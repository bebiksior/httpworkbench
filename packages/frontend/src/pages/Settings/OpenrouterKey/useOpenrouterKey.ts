import { computed, ref } from "vue";
import {
  clearOpenrouterKey,
  useHasOpenrouterKey,
  writeOpenrouterKey,
} from "@/utils/openrouter";

export const useOpenrouterKey = () => {
  const keyInput = ref("");
  const errorMessage = ref<string | undefined>(undefined);
  const hasConfiguredKey = useHasOpenrouterKey();

  const canSubmit = computed(() => keyInput.value.trim().length > 0);

  const handleSave = () => {
    if (!canSubmit.value) {
      return;
    }
    errorMessage.value = undefined;
    const trimmed = keyInput.value.trim();
    if (!writeOpenrouterKey(trimmed)) {
      errorMessage.value = "Local storage is unavailable";
      return;
    }
    keyInput.value = "";
  };

  const handleRemove = () => {
    if (!hasConfiguredKey.value) {
      return;
    }
    errorMessage.value = undefined;
    if (!clearOpenrouterKey()) {
      errorMessage.value = "Local storage is unavailable";
      return;
    }
    keyInput.value = "";
  };

  const handleErrorClose = () => {
    errorMessage.value = undefined;
  };

  return {
    keyInput,
    hasConfiguredKey,
    canSubmit,
    errorMessage,
    handleSave,
    handleRemove,
    handleErrorClose,
  };
};
