export type GuestInstanceRecord = {
  id: string;
  createdAt: number;
};

const isGuestInstanceRecord = (value: unknown): value is GuestInstanceRecord => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    id?: unknown;
    createdAt?: unknown;
  };

  return (
    typeof candidate.id === "string" && typeof candidate.createdAt === "number"
  );
};

export const parseGuestInstanceRecords = (
  raw: string | null,
): GuestInstanceRecord[] => {
  if (raw === null || raw === "") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isGuestInstanceRecord);
  } catch {
    return [];
  }
};

export const pruneExpiredGuestInstanceRecords = (
  records: GuestInstanceRecord[],
  now: number,
  ttlMs: number,
): GuestInstanceRecord[] => {
  return records.filter((record) => record.createdAt + ttlMs > now);
};

export const upsertGuestInstanceRecord = (
  records: GuestInstanceRecord[],
  id: string,
  now: number,
): GuestInstanceRecord[] => {
  const existing = records.find((record) => record.id === id);
  const others = records.filter((record) => record.id !== id);

  return [{ id, createdAt: existing?.createdAt ?? now }, ...others];
};
