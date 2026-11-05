import { instancePolicies } from "../../config";
import {
  removeExpiredInstances,
  removeExpiredMailboxes,
  removeUnusedApiKeyInstances,
} from "../../storage";

export const instanceMaintenanceIntervalMs = 10 * 60 * 1000;

export const runInstanceMaintenance = (now: number) => {
  const expired = removeExpiredInstances(now);
  removeExpiredMailboxes(now);
  const unused =
    instancePolicies.reapUnusedAfterMs === undefined
      ? []
      : removeUnusedApiKeyInstances(now - instancePolicies.reapUnusedAfterMs);
  return { expired, unused };
};
