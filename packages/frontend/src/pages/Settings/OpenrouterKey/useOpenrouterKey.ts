import { computed, onMounted, ref } from "vue";
import {
  clearOpenrouterKey,
  hasOpenrouterKey,
  writeOpenrouterKey,
} from "@/utils/openrouter";

export const useOpenrouterKey = () => {
  const keyInput = ref("");
  const storedKey = ref(false);
  const errorMessage = ref<string | undefined>(undefined);

  const refreshStoredKey = () => {
    storedKey.value = hasOpenrouterKey();
  };

  onMounted(refreshStoredKey);

  const hasConfiguredKey = computed(() => storedKey.value);
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
    storedKey.value = true;
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
    storedKey.value = false;
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
