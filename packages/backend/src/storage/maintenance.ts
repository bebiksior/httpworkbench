import { clearLogsForInstance } from "./repositories/logs";
import { removeExpiredInstances } from "./repositories/instances";

export const cleanupExpiredInstances = async (): Promise<number> => {
  const removedIds = await removeExpiredInstances(Date.now());
  if (removedIds.length === 0) {
    return 0;
  }
  await Promise.all(removedIds.map((id) => clearLogsForInstance(id)));
  return removedIds.length;
};
