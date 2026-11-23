import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { decodeSmtpLog } from "./decodeMime";

export type SmtpLogDisplayMode = "raw" | "decoded" | "html";

export const smtpLogDisplayModes: {
  id: SmtpLogDisplayMode;
  label: string;
  title: string;
}[] = [
  { id: "raw", label: "Raw", title: "Exactly as received" },
  {
    id: "decoded",
    label: "Decoded",
    title: "Quoted-printable, base64 text and encoded headers decoded",
  },
  { id: "html", label: "HTML", title: "Rendered like the mailbox" },
];

const smtpDisplayModePreferenceKey = "httpworkbench.smtp.displayMode";
const defaultDisplayMode: SmtpLogDisplayMode = "html";

const isSmtpLogDisplayMode = (
  value: string | null,
): value is SmtpLogDisplayMode =>
  smtpLogDisplayModes.some((mode) => mode.id === value);

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

export const useSmtpLogDisplay = (raw: MaybeRefOrGetter<string>) => {
  const displayMode = ref<SmtpLogDisplayMode>(readDisplayModePreference());

  const displayedRaw = computed(() =>
    displayMode.value === "raw" ? toValue(raw) : decodeSmtpLog(toValue(raw)),
  );

  const setDisplayMode = (mode: SmtpLogDisplayMode) => {
    displayMode.value = mode;
  };

  watch(displayMode, writeDisplayModePreference);

  return {
    displayMode,
    displayedRaw,
    setDisplayMode,
  };
};
