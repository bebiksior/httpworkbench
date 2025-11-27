const STORAGE_KEY = "httpworkbench_openrouter_key";

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
    return true;
  } catch {
    return false;
  }
};

export const clearOpenrouterKey = (): boolean => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};

export const hasOpenrouterKey = (): boolean =>
  readOpenrouterKey() !== undefined;
