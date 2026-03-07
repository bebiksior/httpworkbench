import { parseBooleanEnv } from "./utils/env";

const monthInMs = 30 * 24 * 60 * 60 * 1000;
const hostedInstanceLimit = 50;
const staticInstanceRawLimitBytes = 10 * 1024 * 1024;
const env = typeof Bun !== "undefined" ? Bun.env : process.env;

const isHosted = parseBooleanEnv(env.IS_HOSTED) ?? false;
const allowGuest = parseBooleanEnv(env.ALLOW_GUEST) ?? true;

export const instancePolicies = {
  isHosted,
  allowGuest,
  ttlMs: isHosted ? monthInMs : undefined,
  maxInstancesPerOwner: isHosted ? hostedInstanceLimit : undefined,
  rawLimitBytes: staticInstanceRawLimitBytes,
};
