import { describe, expect, test } from "vitest";
import {
  createRouteDraft,
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

  test("suggests a free path for new drafts", () => {
    const first = createRouteDraft([], "raw");
    const second = createRouteDraft([first], "raw");
    expect(first.path).toBe("/path-1");
    expect(second.path).toBe("/path-2");
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
      undefined,
      "Enter a path",
      expect.any(String),
      "This path already has a response",
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
});
