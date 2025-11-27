const monthInMs = 30 * 24 * 60 * 60 * 1000;
const hostedInstanceLimit = 50;
const staticInstanceRawLimitBytes = 10 * 1024 * 1024;
const hostedFlag = Bun.env.IS_HOSTED?.toLowerCase();
const isHosted =
  hostedFlag === "true" ||
  hostedFlag === "1" ||
  hostedFlag === "yes" ||
  hostedFlag === "y";

export const instancePolicies = {
  isHosted,
  ttlMs: isHosted ? monthInMs : undefined,
  maxInstancesPerOwner: isHosted ? hostedInstanceLimit : undefined,
  rawLimitBytes: staticInstanceRawLimitBytes,
};
