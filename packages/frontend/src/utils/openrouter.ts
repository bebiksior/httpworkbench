import { computed, onMounted, ref } from "vue";

const STORAGE_KEY = "httpworkbench_openrouter_key";

const isConfiguredKey = (value: string | undefined): boolean =>
  value !== undefined && value.trim() !== "";

const openrouterKeyConfigured = ref(false);
let hasStorageListener = false;

const syncOpenrouterKeyConfigured = () => {
  openrouterKeyConfigured.value = isConfiguredKey(readOpenrouterKey());
};

export const readOpenrouterKey = (): string | undefined => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value !== null ? value : undefined;
  } catch {
    return undefined;
  }
};

export const writeOpenrouterKey = (value: string): boolean => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    syncOpenrouterKeyConfigured();
    return true;
  } catch {
    return false;
  }
};

export const clearOpenrouterKey = (): boolean => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    syncOpenrouterKeyConfigured();
    return true;
  } catch {
    return false;
  }
};

export const hasOpenrouterKey = (): boolean =>
  isConfiguredKey(readOpenrouterKey());

syncOpenrouterKeyConfigured();

export const useHasOpenrouterKey = () => {
  onMounted(() => {
    syncOpenrouterKeyConfigured();
    if (!hasStorageListener) {
      window.addEventListener("storage", syncOpenrouterKeyConfigured);
      hasStorageListener = true;
    }
  });

  return computed(() => openrouterKeyConfigured.value);
};
