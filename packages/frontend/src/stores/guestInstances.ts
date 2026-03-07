import { defineStore } from "pinia";
import { GUEST_INSTANCE_TTL_MS } from "shared";
import { computed, ref } from "vue";
import {
  parseGuestInstanceRecords,
  pruneExpiredGuestInstanceRecords,
  type GuestInstanceRecord,
  upsertGuestInstanceRecord,
} from "./guestInstances.utils";

const STORAGE_KEY = "httpworkbench_guest_instances";

const readRecords = (): GuestInstanceRecord[] => {
  try {
    return parseGuestInstanceRecords(window.localStorage.getItem(STORAGE_KEY));
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
  return pruneExpiredGuestInstanceRecords(
    records,
    Date.now(),
    GUEST_INSTANCE_TTL_MS,
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
    setRecords(upsertGuestInstanceRecord(records.value, id, Date.now()));
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
