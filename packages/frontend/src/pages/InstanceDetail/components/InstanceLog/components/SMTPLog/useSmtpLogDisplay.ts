import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { decodeSmtpLogQuotedPrintable } from "./quotedPrintable";

export type SmtpLogDisplayMode = "decoded" | "raw";

const smtpDisplayModePreferenceKey = "httpworkbench.smtp.displayMode";
const defaultDisplayMode: SmtpLogDisplayMode = "decoded";

const isSmtpLogDisplayMode = (
  value: string | null,
): value is SmtpLogDisplayMode => value === "decoded" || value === "raw";

const getStorage = (): Storage | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const readDisplayModePreference = (): SmtpLogDisplayMode => {
  const stored = getStorage()?.getItem(smtpDisplayModePreferenceKey) ?? null;
  return isSmtpLogDisplayMode(stored) ? stored : defaultDisplayMode;
};

const writeDisplayModePreference = (mode: SmtpLogDisplayMode): void => {
  try {
    getStorage()?.setItem(smtpDisplayModePreferenceKey, mode);
  } catch {}
};

export const getNextSmtpLogDisplayMode = (
  mode: SmtpLogDisplayMode,
): SmtpLogDisplayMode => (mode === "decoded" ? "raw" : "decoded");

export const useSmtpLogDisplay = (raw: MaybeRefOrGetter<string>) => {
  const displayMode = ref<SmtpLogDisplayMode>(readDisplayModePreference());

  const displayedRaw = computed(() =>
    displayMode.value === "decoded"
      ? decodeSmtpLogQuotedPrintable(toValue(raw))
      : toValue(raw),
  );

  const displayModeLabel = computed(() => displayMode.value);
  const nextDisplayModeLabel = computed(() =>
    getNextSmtpLogDisplayMode(displayMode.value),
  );

  const setDisplayMode = (mode: SmtpLogDisplayMode) => {
    displayMode.value = mode;
  };

  const toggleDisplayMode = () => {
    setDisplayMode(getNextSmtpLogDisplayMode(displayMode.value));
  };

  watch(displayMode, writeDisplayModePreference);

  return {
    displayMode,
    displayModeLabel,
    displayedRaw,
    nextDisplayModeLabel,
    setDisplayMode,
    toggleDisplayMode,
  };
};
