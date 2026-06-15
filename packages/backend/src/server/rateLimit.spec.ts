import { describe, expect, test } from "bun:test";
import { createFixedWindowRateLimiter } from "./rateLimit";

describe("createFixedWindowRateLimiter", () => {
  test("allows up to maxRequests then blocks within the window", () => {
    const limiter = createFixedWindowRateLimiter({
      maxRequests: 3,
      windowMs: 1000,
    });
    expect(limiter.check("k", 0)).toBe(true);
    expect(limiter.check("k", 100)).toBe(true);
    expect(limiter.check("k", 200)).toBe(true);
    expect(limiter.check("k", 300)).toBe(false);
  });

  test("resets once the window has elapsed", () => {
    const limiter = createFixedWindowRateLimiter({
      maxRequests: 1,
      windowMs: 1000,
    });
    expect(limiter.check("k", 0)).toBe(true);
    expect(limiter.check("k", 500)).toBe(false);
    expect(limiter.check("k", 1000)).toBe(true);
  });

  test("tracks each key independently", () => {
    const limiter = createFixedWindowRateLimiter({
      maxRequests: 1,
      windowMs: 1000,
    });
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("b", 0)).toBe(true);
    expect(limiter.check("a", 0)).toBe(false);
    expect(limiter.check("b", 0)).toBe(false);
  });
});
