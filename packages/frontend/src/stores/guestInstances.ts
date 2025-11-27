import { defineStore } from "pinia";
import { GUEST_INSTANCE_TTL_MS } from "shared";
import { computed, ref } from "vue";

type GuestInstanceRecord = {
  id: string;
  createdAt: number;
};

const STORAGE_KEY = "httpworkbench_guest_instances";

const readRecords = (): GuestInstanceRecord[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === "") {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry: GuestInstanceRecord) =>
        typeof entry?.id === "string" && typeof entry?.createdAt === "number",
    );
  } catch {
    return [];
  }
};

const persistRecords = (records: GuestInstanceRecord[]) => {
  try {
    if (records.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  } catch {}
};

const pruneExpired = (records: GuestInstanceRecord[]) => {
  const now = Date.now();
  return records.filter(
    (record) => record.createdAt + GUEST_INSTANCE_TTL_MS > now,
  );
};

export const useGuestInstancesStore = defineStore("guestInstances", () => {
  const records = ref<GuestInstanceRecord[]>(pruneExpired(readRecords()));

  const setRecords = (next: GuestInstanceRecord[]) => {
    const cleaned = pruneExpired(next);
    records.value = cleaned;
    persistRecords(cleaned);
  };

  const cleanupExpired = () => {
    setRecords(records.value);
  };

  const trackInstance = (id: string) => {
    const existing = records.value.find((record) => record.id === id);
    const others = records.value.filter((record) => record.id !== id);
    const createdAt = existing?.createdAt ?? Date.now();
    setRecords([{ id, createdAt }, ...others]);
  };

  const forgetInstance = (id: string) => {
    setRecords(records.value.filter((record) => record.id !== id));
  };

  const reset = () => {
    setRecords([]);
  };

  return {
    records: computed(() => records.value),
    ids: computed(() => records.value.map((record) => record.id)),
    trackInstance,
    forgetInstance,
    cleanupExpired,
    reset,
  };
});
