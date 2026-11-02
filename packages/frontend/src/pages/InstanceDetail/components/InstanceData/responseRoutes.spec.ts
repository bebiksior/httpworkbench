import { describe, expect, test } from "vitest";
import {
  createRouteDraft,
  responseSummary,
  routeLabel,
  routesEqual,
  toInstanceRoutes,
  toRouteDrafts,
  validateRouteDrafts,
} from "./responseRoutes";

describe("responseRoutes", () => {
  test("round-trips routes through drafts and trims paths", () => {
    const drafts = toRouteDrafts([
      { path: " /a ", raw: "HTTP/1.1 200 OK\r\n\r\n" },
      { method: "POST", path: "/b", raw: "HTTP/1.1 201 Created\r\n\r\n" },
    ]);
    expect(new Set(drafts.map(({ key }) => key)).size).toBe(2);
    expect(toInstanceRoutes(drafts)).toEqual([
      { path: "/a", raw: "HTTP/1.1 200 OK\r\n\r\n" },
      { method: "POST", path: "/b", raw: "HTTP/1.1 201 Created\r\n\r\n" },
    ]);
  });

  test("starts new drafts at the root path", () => {
    expect(createRouteDraft("raw")).toMatchObject({ path: "/", raw: "raw" });
  });

  test("flags invalid and duplicate paths", () => {
    const drafts = toRouteDrafts([
      { path: "/a", raw: "" },
      { path: " ", raw: "" },
      { path: "/a?x=1", raw: "" },
      { path: "/a", raw: "" },
      { method: "POST", path: "/a", raw: "" },
    ]);
    const errors = validateRouteDrafts(drafts);
    expect(drafts.map(({ key }) => errors[key])).toEqual([
      "Duplicate",
      "Required",
      "No spaces, ? or #",
      "Duplicate",
      undefined,
    ]);
  });

  test("compares routes ignoring line ending differences", () => {
    expect(
      routesEqual(
        [{ path: "/a", raw: "HTTP/1.1 200 OK\r\n\r\n" }],
        [{ path: "/a", raw: "HTTP/1.1 200 OK\n\n" }],
      ),
    ).toBe(true);
    expect(
      routesEqual(
        [{ path: "/a", raw: "x" }],
        [{ method: "GET", path: "/a", raw: "x" }],
      ),
    ).toBe(false);
  });

  test("labels routes with their method", () => {
    expect(routeLabel({ path: " /a " })).toBe("/a");
    expect(routeLabel({ method: "POST", path: "/a" })).toBe("POST /a");
  });

  test("summarizes status codes and redirect targets", () => {
    expect(responseSummary("HTTP/1.1 201 Created\r\n\r\n")).toEqual({
      code: "201",
      detail: "201 Created",
    });
    expect(
      responseSummary(
        "HTTP/1.1 302 Found\r\nLocation: http://169.254.169.254/x\r\n\r\nLocation: ignored",
      ),
    ).toEqual({
      code: "302 → 169.254.169.254/x",
      detail: "302 Found → http://169.254.169.254/x",
    });
    expect(responseSummary("nope").code).toBe("Invalid");
  });
});
