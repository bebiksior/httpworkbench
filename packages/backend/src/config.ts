const monthInMs = 30 * 24 * 60 * 60 * 1000;
const hostedInstanceLimit = 50;
const staticInstanceRawLimitBytes = 10 * 1024 * 1024;

const parseBoolEnv = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes" || lower === "y") {
    return true;
  }
  if (lower === "false" || lower === "0" || lower === "no" || lower === "n") {
    return false;
  }
  return undefined;
};

const isHosted = parseBoolEnv(Bun.env.IS_HOSTED) ?? false;
const allowGuest = parseBoolEnv(Bun.env.ALLOW_GUEST) ?? true;

export const instancePolicies = {
  isHosted,
  allowGuest,
  ttlMs: isHosted ? monthInMs : undefined,
  maxInstancesPerOwner: isHosted ? hostedInstanceLimit : undefined,
  rawLimitBytes: staticInstanceRawLimitBytes,
};
