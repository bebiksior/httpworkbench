type RateLimitBucket = {
  windowStart: number;
  count: number;
};

type FixedWindowRateLimiter = {
  check: (key: string, now?: number) => boolean;
};

export const createFixedWindowRateLimiter = ({
  maxRequests,
  windowMs,
}: {
  maxRequests: number;
  windowMs: number;
}): FixedWindowRateLimiter => {
  const buckets = new Map<string, RateLimitBucket>();
  let lastPruned = 0;

  const pruneExpired = (now: number) => {
    if (now - lastPruned < windowMs) {
      return;
    }
    lastPruned = now;
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= windowMs) {
        buckets.delete(key);
      }
    }
  };

  return {
    check: (key, now = Date.now()) => {
      pruneExpired(now);
      const current = buckets.get(key);
      if (current === undefined || now - current.windowStart >= windowMs) {
        buckets.set(key, { windowStart: now, count: 1 });
        return true;
      }
      if (current.count >= maxRequests) {
        return false;
      }
      current.count += 1;
      return true;
    },
  };
};
