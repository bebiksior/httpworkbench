export const createConcurrentWatchLimiter = ({
  maxPerKey,
  maxGlobal,
}: {
  maxPerKey: number;
  maxGlobal: number;
}) => {
  const activeByKey = new Map<string, number>();
  let activeGlobal = 0;

  return {
    acquire(key: string): (() => void) | undefined {
      const activeForKey = activeByKey.get(key) ?? 0;
      if (activeForKey >= maxPerKey || activeGlobal >= maxGlobal) {
        return undefined;
      }

      activeByKey.set(key, activeForKey + 1);
      activeGlobal += 1;
      let released = false;

      return () => {
        if (released) {
          return;
        }
        released = true;
        activeGlobal -= 1;
        const remainingForKey = (activeByKey.get(key) ?? 1) - 1;
        if (remainingForKey === 0) {
          activeByKey.delete(key);
        } else {
          activeByKey.set(key, remainingForKey);
        }
      };
    },
  };
};
