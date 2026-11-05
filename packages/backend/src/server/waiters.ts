export const createKeyedWaiters = () => {
  const waitersByKey = new Map<string, Set<() => void>>();

  const wait = (key: string, timeoutMs: number, signal?: AbortSignal) => {
    let waiters = waitersByKey.get(key);
    if (waiters === undefined) {
      waiters = new Set();
      waitersByKey.set(key, waiters);
    }

    let settled = false;
    let resolvePromise: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener("abort", settle);
      waiters.delete(settle);
      if (waiters.size === 0) {
        waitersByKey.delete(key);
      }
      resolvePromise();
    };
    timeout = setTimeout(settle, timeoutMs);
    waiters.add(settle);
    if (signal?.aborted === true) {
      settle();
    } else {
      signal?.addEventListener("abort", settle, { once: true });
    }

    return { promise, cancel: settle };
  };

  const notify = (key: string) => {
    const waiters = waitersByKey.get(key);
    if (waiters === undefined) {
      return;
    }
    for (const settle of [...waiters]) {
      settle();
    }
  };

  return { wait, notify };
};
