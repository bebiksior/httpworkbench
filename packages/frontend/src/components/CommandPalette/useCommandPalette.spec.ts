import { describe, expect, test } from "vitest";
import type { InstanceSummary } from "shared";
import {
  filterCommandInstances,
  moveCommandSelection,
} from "./useCommandPalette";

const instances: InstanceSummary[] = [
  {
    id: "alpha-id",
    ownerId: "owner",
    createdAt: 1,
    label: "Checkout hook",
    public: false,
    locked: false,
    logCount: 0,
  },
  {
    id: "beta-id",
    ownerId: "owner",
    createdAt: 2,
    public: false,
    locked: false,
    logCount: 0,
  },
];

describe("command palette helpers", () => {
  test("filters by label or instance ID without changing source order", () => {
    expect(filterCommandInstances(instances, "checkout")).toEqual([
      instances[0],
    ]);
    expect(filterCommandInstances(instances, "BETA")).toEqual([instances[1]]);
  });

  test("wraps keyboard selection in both directions", () => {
    expect(moveCommandSelection(1, 2, 1)).toBe(0);
    expect(moveCommandSelection(0, 2, -1)).toBe(1);
    expect(moveCommandSelection(-1, 2, 1)).toBe(0);
    expect(moveCommandSelection(-1, 2, -1)).toBe(1);
    expect(moveCommandSelection(0, 0, 1)).toBe(-1);
  });
});
