import type { RouteLocationRaw } from "vue-router";
import { isAbsent } from "@/utils/types";

export const buildExitRoute = (
  instanceId: string | undefined,
): RouteLocationRaw => {
  if (isAbsent(instanceId) || instanceId === "") {
    return "/";
  }
  return { name: "instanceDetail", params: { id: instanceId } };
};

type LeaveGuardOptions = {
  isDirty: () => boolean;
  markClean: () => void;
  confirmLeave: (accept: () => void) => void;
  navigate: (target: RouteLocationRaw) => void;
};

export const createLeaveGuard = ({
  isDirty,
  markClean,
  confirmLeave,
  navigate,
}: LeaveGuardOptions) => {
  return (to: { fullPath: string }, next: (allow?: false) => void) => {
    if (!isDirty()) {
      next();
      return;
    }

    next(false);
    confirmLeave(() => {
      markClean();
      navigate(to.fullPath);
    });
  };
};
