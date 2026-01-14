import { defineStore } from "pinia";
import { ref, watch } from "vue";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "httpworkbench-theme";

export const useThemeStore = defineStore("theme", () => {
  const getInitialTheme = (): ThemeMode => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  const mode = ref<ThemeMode>(getInitialTheme());

  const applyTheme = (theme: ThemeMode) => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("darkmode");
    } else {
      root.classList.remove("darkmode");
    }
  };

  const toggle = () => {
    mode.value = mode.value === "dark" ? "light" : "dark";
  };

  const setMode = (newMode: ThemeMode) => {
    mode.value = newMode;
  };

  watch(
    mode,
    (newMode) => {
      localStorage.setItem(STORAGE_KEY, newMode);
      applyTheme(newMode);
    },
    { immediate: true },
  );

  return {
    mode,
    toggle,
    setMode,
  };
});
