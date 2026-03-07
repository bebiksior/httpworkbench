import { describe, expect, test } from "vitest";
import { GUEST_INSTANCE_TTL_MS } from "shared";
import {
  parseGuestInstanceRecords,
  pruneExpiredGuestInstanceRecords,
  upsertGuestInstanceRecord,
} from "./guestInstances.utils";

describe("parseGuestInstanceRecords", () => {
  test("returns an empty array for invalid JSON", () => {
    expect(parseGuestInstanceRecords("{")).toEqual([]);
  });

  test("returns an empty array for non-array JSON", () => {
    expect(parseGuestInstanceRecords('{"id":"demo"}')).toEqual([]);
  });

  test("filters malformed entries", () => {
    expect(
      parseGuestInstanceRecords(
        JSON.stringify([
          { id: "first", createdAt: 1 },
          { id: 3, createdAt: 2 },
          { id: "third", createdAt: "2" },
        ]),
      ),
    ).toEqual([{ id: "first", createdAt: 1 }]);
  });
});

describe("pruneExpiredGuestInstanceRecords", () => {
  test("removes expired records using the provided now value", () => {
    expect(
      pruneExpiredGuestInstanceRecords(
        [
          { id: "fresh", createdAt: 10 },
          { id: "expired", createdAt: 10 },
        ],
        10 + GUEST_INSTANCE_TTL_MS,
        GUEST_INSTANCE_TTL_MS,
      ),
    ).toEqual([]);
  });

  test("keeps records that are still within the ttl window", () => {
    expect(
      pruneExpiredGuestInstanceRecords(
        [
          { id: "fresh", createdAt: 100 },
          { id: "expired", createdAt: 0 },
        ],
        GUEST_INSTANCE_TTL_MS + 99,
        GUEST_INSTANCE_TTL_MS,
      ),
    ).toEqual([{ id: "fresh", createdAt: 100 }]);
  });
});

describe("upsertGuestInstanceRecord", () => {
  test("prepends a newly tracked id", () => {
    expect(
      upsertGuestInstanceRecord([{ id: "older", createdAt: 1 }], "new", 10),
    ).toEqual([
      { id: "new", createdAt: 10 },
      { id: "older", createdAt: 1 },
    ]);
  });

  test("moves an existing id to the front and preserves createdAt", () => {
    expect(
      upsertGuestInstanceRecord(
        [
          { id: "first", createdAt: 1 },
          { id: "existing", createdAt: 2 },
          { id: "third", createdAt: 3 },
        ],
        "existing",
        99,
      ),
    ).toEqual([
      { id: "existing", createdAt: 2 },
      { id: "first", createdAt: 1 },
      { id: "third", createdAt: 3 },
    ]);
  });
});
