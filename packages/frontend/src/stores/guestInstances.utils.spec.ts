import { describe, expect, test } from "vitest";
import { GUEST_INSTANCE_TTL_MS } from "shared";
import {
  parseGuestInstanceRecords,
  pruneExpiredGuestInstanceRecords,
  upsertGuestInstanceRecord,
} from "./guestInstances.utils";

const firstToken = "header.first.signature";
const secondToken = "header.second.signature";
const thirdToken = "header.third.signature";

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
          { id: "first", token: firstToken, createdAt: 1 },
          { id: 3, token: secondToken, createdAt: 2 },
          { id: "third", token: thirdToken, createdAt: "2" },
          { id: "invalid-token", token: "short", createdAt: 3 },
        ]),
      ),
    ).toEqual([{ id: "first", token: firstToken, createdAt: 1 }]);
  });

  test("discards legacy id-only records", () => {
    expect(
      parseGuestInstanceRecords('[{"id":"legacy","createdAt":1}]'),
    ).toEqual([]);
  });
});

describe("pruneExpiredGuestInstanceRecords", () => {
  test("removes expired records using the provided now value", () => {
    expect(
      pruneExpiredGuestInstanceRecords(
        [
          { id: "fresh", token: firstToken, createdAt: 10 },
          { id: "expired", token: secondToken, createdAt: 10 },
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
          { id: "fresh", token: firstToken, createdAt: 100 },
          { id: "expired", token: secondToken, createdAt: 0 },
        ],
        GUEST_INSTANCE_TTL_MS + 99,
        GUEST_INSTANCE_TTL_MS,
      ),
    ).toEqual([{ id: "fresh", token: firstToken, createdAt: 100 }]);
  });
});

describe("upsertGuestInstanceRecord", () => {
  test("prepends a newly tracked id", () => {
    expect(
      upsertGuestInstanceRecord(
        [{ id: "older", token: firstToken, createdAt: 1 }],
        "new",
        secondToken,
        10,
      ),
    ).toEqual([
      { id: "new", token: secondToken, createdAt: 10 },
      { id: "older", token: firstToken, createdAt: 1 },
    ]);
  });

  test("moves an existing id to the front and preserves createdAt", () => {
    expect(
      upsertGuestInstanceRecord(
        [
          { id: "first", token: firstToken, createdAt: 1 },
          { id: "existing", token: secondToken, createdAt: 2 },
          { id: "third", token: thirdToken, createdAt: 3 },
        ],
        "existing",
        firstToken,
        99,
      ),
    ).toEqual([
      { id: "existing", token: firstToken, createdAt: 2 },
      { id: "first", token: firstToken, createdAt: 1 },
      { id: "third", token: thirdToken, createdAt: 3 },
    ]);
  });
});
