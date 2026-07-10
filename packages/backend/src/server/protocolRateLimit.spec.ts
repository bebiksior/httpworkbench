import { expect, test } from "bun:test";
import { createBoundedProtocolRateLimiter } from "./protocolRateLimit";

test("limits requests within a fixed window", () => {
  const limiter = createBoundedProtocolRateLimiter({
    maxRequests: 2,
    windowMs: 1000,
    maxEntries: 10,
  });

  expect(limiter.check("instance:address", 100)).toBe(true);
  expect(limiter.check("instance:address", 200)).toBe(true);
  expect(limiter.check("instance:address", 300)).toBe(false);
  expect(limiter.check("instance:address", 1100)).toBe(true);
});

test("rejects new keys at capacity without resetting active buckets", () => {
  const limiter = createBoundedProtocolRateLimiter({
    maxRequests: 2,
    windowMs: 1000,
    maxEntries: 2,
  });

  expect(limiter.check("a", 0)).toBe(true);
  expect(limiter.check("b", 0)).toBe(true);
  expect(limiter.check("a", 1)).toBe(true);
  expect(limiter.canCheck("c", 1)).toBe(false);
  expect(limiter.check("c", 1)).toBe(false);
  expect(limiter.check("a", 2)).toBe(false);
  expect(limiter.check("c", 1000)).toBe(true);
});
