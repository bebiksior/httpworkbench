import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useInstanceDetailPreferencesStore } from "./instanceDetailPreferences";

const createStorage = (): Storage => {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useInstanceDetailPreferencesStore", () => {
  test("restores panel and log filter preferences", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    setActivePinia(createPinia());

    const preferences = useInstanceDetailPreferencesStore();
    preferences.sidePanelHidden = true;
    preferences.selectedLogTypes = ["http"];

    setActivePinia(createPinia());
    const restored = useInstanceDetailPreferencesStore();

    expect(restored.sidePanelHidden).toBe(true);
    expect(restored.selectedLogTypes).toEqual(["http"]);
  });
});
