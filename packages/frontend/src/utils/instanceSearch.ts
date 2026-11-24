import type { InstanceSummary } from "shared";
import { config } from "@/config";

export const matchesInstanceQuery = (
  instance: Pick<InstanceSummary, "id" | "label">,
  query: string,
) => {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return true;
  }
  return [config.getInstanceHost(instance.id), instance.label ?? ""].some(
    (value) => value.toLowerCase().includes(normalized),
  );
};
