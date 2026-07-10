type RateLimitEntry = {
  windowStartedAt: number;
  count: number;
};

export const createBoundedProtocolRateLimiter = ({
  maxRequests,
  windowMs,
  maxEntries,
}: {
  maxRequests: number;
  windowMs: number;
  maxEntries: number;
}) => {
  const entries = new Map<string, RateLimitEntry>();
  let lastPrunedAt = Number.NEGATIVE_INFINITY;

  const pruneExpired = (now: number) => {
    if (now - lastPrunedAt < windowMs) {
      return;
    }

    lastPrunedAt = now;
    for (const [key, entry] of entries) {
      if (now - entry.windowStartedAt >= windowMs) {
        entries.delete(key);
      }
    }
  };

  return {
    canCheck(key: string, now: number): boolean {
      const current = entries.get(key);
      return (
        current === undefined ||
        now - current.windowStartedAt >= windowMs ||
        current.count < maxRequests
      );
    },
    check(key: string, now: number): boolean {
      const current = entries.get(key);
      if (current !== undefined && now - current.windowStartedAt < windowMs) {
        if (current.count >= maxRequests) {
          return false;
        }
        current.count += 1;
        return true;
      }

      if (current !== undefined) {
        entries.delete(key);
      }
      pruneExpired(now);

      if (entries.size >= maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey !== undefined) {
          entries.delete(oldestKey);
        }
      }

      entries.set(key, { windowStartedAt: now, count: 1 });
      return true;
    },
    reset(): void {
      entries.clear();
      lastPrunedAt = Number.NEGATIVE_INFINITY;
    },
  };
};
