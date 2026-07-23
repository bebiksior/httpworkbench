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
  let nextExpiryAt = Number.POSITIVE_INFINITY;

  const pruneExpired = (now: number) => {
    if (now < nextExpiryAt) {
      return;
    }

    nextExpiryAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of entries) {
      if (now - entry.windowStartedAt >= windowMs) {
        entries.delete(key);
      } else {
        nextExpiryAt = Math.min(nextExpiryAt, entry.windowStartedAt + windowMs);
      }
    }
  };

  const addEntry = (key: string, now: number) => {
    entries.set(key, { windowStartedAt: now, count: 1 });
    nextExpiryAt = Math.min(nextExpiryAt, now + windowMs);
  };

  return {
    canCheck(key: string, now: number): boolean {
      const current = entries.get(key);
      if (current !== undefined) {
        return (
          now - current.windowStartedAt >= windowMs ||
          current.count < maxRequests
        );
      }

      pruneExpired(now);
      return entries.size < maxEntries;
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
        return false;
      }

      addEntry(key, now);
      return true;
    },
    reset(): void {
      entries.clear();
      nextExpiryAt = Number.POSITIVE_INFINITY;
    },
  };
};
