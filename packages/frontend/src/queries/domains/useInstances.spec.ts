import { describe, expect, test, vi } from "vitest";
import type { InstanceSummary } from "shared";
import { loadGuestInstanceSummaries } from "./useInstances";

describe("loadGuestInstanceSummaries", () => {
  test("loads more than 100 guest records in ordered batches", async () => {
    const records = Array.from({ length: 205 }, (_, index) => ({
      id: `instance-${index}`,
      token: String(index).padStart(64, "a").slice(-64),
      createdAt: index,
    }));
    const loadBatch = vi.fn(
      async ({ instances }: { instances: Array<{ id: string }> }) =>
        instances.map(({ id }, index): InstanceSummary => ({
          id,
          ownerId: "guest",
          createdAt: index,
          public: false,
          locked: false,
          logCount: 0,
        })),
    );

    const result = await loadGuestInstanceSummaries(records, loadBatch);

    expect(loadBatch).toHaveBeenCalledTimes(3);
    expect(
      loadBatch.mock.calls.map(([input]) => input.instances.length),
    ).toEqual([100, 100, 5]);
    expect(result.map(({ id }) => id)).toEqual(records.map(({ id }) => id));
  });
});
