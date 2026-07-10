import { expect, test } from "bun:test";
import { createConcurrentWatchLimiter } from "./watchLimit";

test("limits concurrent watches per key and globally", () => {
  const limiter = createConcurrentWatchLimiter({
    maxPerKey: 2,
    maxGlobal: 3,
  });
  const releaseA1 = limiter.acquire("a");
  const releaseA2 = limiter.acquire("a");
  const releaseB = limiter.acquire("b");

  expect(releaseA1).toBeFunction();
  expect(releaseA2).toBeFunction();
  expect(releaseB).toBeFunction();
  expect(limiter.acquire("a")).toBeUndefined();
  expect(limiter.acquire("c")).toBeUndefined();

  releaseA1?.();
  const releaseC = limiter.acquire("c");
  expect(releaseC).toBeFunction();

  releaseA1?.();
  releaseA2?.();
  releaseB?.();
  releaseC?.();
  expect(limiter.acquire("a")).toBeFunction();
});
