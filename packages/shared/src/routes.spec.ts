import { describe, expect, test } from "vitest";
import {
  InstanceRouteSchema,
  findInstanceRoute,
  parseRequestTarget,
  type InstanceRoute,
} from "./routes";

const route = (path: string, method?: InstanceRoute["method"]) => ({
  path,
  raw: `${method ?? "ANY"} ${path}`,
  ...(method === undefined ? {} : { method }),
});

describe("findInstanceRoute", () => {
  const routes = [
    route("/*"),
    route("/api/*"),
    route("/api/users"),
    route("/api/users", "POST"),
    route("/*.js"),
  ];

  test.each([
    ["GET", "/api/users", "ANY /api/users"],
    ["POST", "/api/users", "POST /api/users"],
    ["HEAD", "/api/users", "ANY /api/users"],
    ["GET", "/api/orders", "ANY /api/*"],
    ["GET", "/app.js", "ANY /*.js"],
    ["GET", "/", "ANY /*"],
  ])("%s %s uses %s", (method, path, expected) => {
    expect(findInstanceRoute(routes, method, path)?.raw).toBe(expected);
  });

  test("lets GET routes answer HEAD but not other methods", () => {
    const getOnly = [route("/x", "GET")];
    expect(findInstanceRoute(getOnly, "HEAD", "/x")).toBeDefined();
    expect(findInstanceRoute(getOnly, "POST", "/x")).toBeUndefined();
  });

  test("treats regex characters in paths literally", () => {
    expect(findInstanceRoute([route("/a.b")], "GET", "/aXb")).toBeUndefined();
    expect(findInstanceRoute([route("/a.b")], "GET", "/a.b")).toBeDefined();
  });
});

describe("parseRequestTarget", () => {
  test.each([
    ["GET /cb?x=1 HTTP/1.1\r\nHost: a", "GET", "/cb"],
    ["POST http://h.example/p/q#f HTTP/1.1", "POST", "/p/q"],
    ["GET http://h.example?x=/y HTTP/1.1", "GET", "/"],
    ["GET / HTTP/1.1", "GET", "/"],
  ])("parses %j", (raw, method, path) => {
    expect(parseRequestTarget(raw)).toEqual({ method, path });
  });
});

describe("InstanceRouteSchema", () => {
  test.each(["api", "/a b", "/a?x=1", "/a#x"])("rejects path %j", (path) => {
    expect(
      InstanceRouteSchema.safeParse({ path, raw: "HTTP/1.1 200 OK\r\n\r\n" })
        .success,
    ).toBe(false);
  });
});
