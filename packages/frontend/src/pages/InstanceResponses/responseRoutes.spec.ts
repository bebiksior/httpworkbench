import type { Log } from "shared";
import { describe, expect, test } from "vitest";
import {
  adjacentKey,
  arrangeByOrder,
  createRouteDraft,
  priorityOrder,
  routeLabel,
  routesEqual,
  routeUrl,
  servedStats,
  statusCode,
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

  test("starts new drafts at a given path", () => {
    expect(createRouteDraft("raw", "/login")).toMatchObject({
      path: "/login",
      raw: "raw",
    });
  });

  test("reads the status code from the status line", () => {
    expect(statusCode("HTTP/1.1 302 Found\r\nLocation: /\r\n\r\n")).toBe("302");
    expect(statusCode("HTTP/2 204\n\n")).toBe("204");
    expect(statusCode("nope")).toBeUndefined();
  });

  test("orders exact paths first, then wildcards by literal length", () => {
    const drafts = toRouteDrafts([
      { path: "/*.js", raw: "" },
      { path: "/login", raw: "" },
      { path: "/api/*", raw: "" },
      { method: "POST", path: "/graphql", raw: "" },
      { path: "/graphql", raw: "" },
      { path: "/api/v1/*", raw: "" },
    ]);
    const order = priorityOrder(drafts);
    expect(
      order.map((key) => {
        const draft = drafts.find((candidate) => candidate.key === key);
        return draft === undefined ? key : routeLabel(draft);
      }),
    ).toEqual([
      "POST /graphql",
      "/graphql",
      "/login",
      "/api/v1/*",
      "/api/*",
      "/*.js",
    ]);
  });

  test("keeps a frozen order and appends drafts it does not know", () => {
    const drafts = toRouteDrafts([
      { path: "/b", raw: "" },
      { path: "/a", raw: "" },
      { path: "/c", raw: "" },
    ]);
    const [b, a, c] = drafts;
    const arranged = arrangeByOrder(drafts, [
      a?.key ?? "",
      "gone",
      b?.key ?? "",
    ]);
    expect(arranged.map((draft) => draft.path)).toEqual(["/a", "/b", "/c"]);
    expect(c).toBeDefined();
  });

  test("steps through keys without leaving the list", () => {
    const keys = ["a", "b", "default"];
    expect(adjacentKey(keys, "a", 1)).toBe("b");
    expect(adjacentKey(keys, "default", 1)).toBe("default");
    expect(adjacentKey(keys, "a", -1)).toBe("a");
    expect(adjacentKey(keys, "missing", 1)).toBe("a");
  });

  test("builds a visitable URL, cutting wildcards to their prefix", () => {
    const base = "https://abc.instances.test";
    expect(routeUrl(base, "/login")).toBe(`${base}/login`);
    expect(routeUrl(base, "/api/*")).toBe(`${base}/api/`);
    expect(routeUrl(base, "/*.js")).toBe(`${base}/.js`);
    expect(routeUrl(base, undefined)).toBe(`${base}/`);
    expect(routeUrl(base, "oops")).toBe(`${base}/`);
  });

  test("counts HTTP logs served by a route or by the default", () => {
    const log = (id: string, timestamp: number, route?: string): Log => ({
      id,
      instanceId: "i",
      type: "http",
      timestamp,
      address: "1.1.1.1",
      raw: "",
      ...(route === undefined ? {} : { route }),
    });
    const logs: Log[] = [
      log("1", 10, "GET /login"),
      log("2", 30, "GET /login"),
      log("3", 20),
      { ...log("4", 40), type: "dns" },
    ];
    expect(servedStats(logs, "GET /login")).toEqual({ count: 2, lastAt: 30 });
    expect(servedStats(logs, undefined)).toEqual({ count: 1, lastAt: 20 });
    expect(servedStats(logs, "/nope")).toEqual({
      count: 0,
      lastAt: undefined,
    });
  });
});
