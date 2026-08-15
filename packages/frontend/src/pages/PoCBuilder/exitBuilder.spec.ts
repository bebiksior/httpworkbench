import { describe, expect, test, vi } from "vitest";
import { buildExitRoute, createLeaveGuard } from "./exitBuilder";

describe("buildExitRoute", () => {
  test("returns the instance detail route", () => {
    expect(buildExitRoute("abc123")).toEqual({
      name: "instanceDetail",
      params: { id: "abc123" },
    });
  });

  test("falls back to home without an instance id", () => {
    expect(buildExitRoute(undefined)).toBe("/");
    expect(buildExitRoute("")).toBe("/");
  });
});

describe("createLeaveGuard", () => {
  const setup = (dirty: boolean) => {
    const next = vi.fn();
    const markClean = vi.fn();
    const navigate = vi.fn();
    const confirmLeave = vi.fn();
    const guard = createLeaveGuard({
      isDirty: () => dirty,
      markClean,
      confirmLeave,
      navigate,
    });
    return { guard, next, markClean, navigate, confirmLeave };
  };

  test("allows leaving without unsaved changes", () => {
    const { guard, next, confirmLeave } = setup(false);

    guard({ fullPath: "/instances/abc123" }, next);

    expect(next).toHaveBeenCalledWith();
    expect(confirmLeave).not.toHaveBeenCalled();
  });

  test("blocks and asks for confirmation with unsaved changes", () => {
    const { guard, next, navigate, confirmLeave } = setup(true);

    guard({ fullPath: "/instances/abc123" }, next);

    expect(next).toHaveBeenCalledWith(false);
    expect(confirmLeave).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("navigates to the blocked target once confirmed", () => {
    const { guard, next, markClean, navigate, confirmLeave } = setup(true);

    guard({ fullPath: "/instances/abc123" }, next);
    confirmLeave.mock.calls[0]?.[0]();

    expect(markClean).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/instances/abc123");
    expect(markClean.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0] ?? 0,
    );
  });

  test("stays on the page when confirmation is dismissed", () => {
    const { guard, next, markClean, navigate } = setup(true);

    guard({ fullPath: "/instances/abc123" }, next);

    expect(markClean).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
