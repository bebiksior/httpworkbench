import { z } from "zod";

export const ROUTE_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
] as const;

export const MAX_INSTANCE_ROUTES = 50;

export const RouteMethodSchema = z.enum(ROUTE_METHODS);

export type RouteMethod = z.infer<typeof RouteMethodSchema>;

export const RoutePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^\//, "Path must start with /")
  .regex(/^[^\s?#]*$/, "Path cannot contain spaces, ? or #");

export const InstanceRouteSchema = z.object({
  method: RouteMethodSchema.optional().describe(
    "Only match this method. Omit to match any method. GET also matches HEAD.",
  ),
  path: RoutePathSchema.describe(
    "Request path to match, without query string. Use * as a wildcard, e.g. /api/* or /*.js.",
  ),
  raw: z
    .string()
    .describe(
      "Complete raw HTTP response served for this path: status line, headers, blank line, and body.",
    ),
});

export type InstanceRoute = z.infer<typeof InstanceRouteSchema>;

export const routeKey = (route: Pick<InstanceRoute, "method" | "path">) =>
  `${route.method ?? "*"} ${route.path}`;

const patternCache = new Map<string, RegExp>();

const patternToRegExp = (pattern: string) => {
  const cached = patternCache.get(pattern);
  if (cached !== undefined) {
    return cached;
  }
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regExp = new RegExp(`^${source}$`);
  if (patternCache.size > 1_000) {
    patternCache.clear();
  }
  patternCache.set(pattern, regExp);
  return regExp;
};

export const routePathMatches = (pattern: string, path: string) =>
  pattern.includes("*")
    ? patternToRegExp(pattern).test(path)
    : pattern === path;

const routeMethodMatches = (
  routeMethod: RouteMethod | undefined,
  method: string,
) =>
  routeMethod === undefined ||
  routeMethod === method ||
  (routeMethod === "GET" && method === "HEAD");

const specificity = (route: InstanceRoute, method: string) => [
  route.path.includes("*") ? 0 : 1,
  route.path.replaceAll("*", "").length,
  route.method === method ? 2 : route.method === undefined ? 0 : 1,
];

const compareSpecificity = (a: number[], b: number[]) => {
  for (let index = 0; index < a.length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

export const findInstanceRoute = <T extends InstanceRoute>(
  routes: readonly T[],
  method: string,
  path: string,
): T | undefined => {
  let best: { route: T; score: number[] } | undefined;
  for (const route of routes) {
    if (
      !routeMethodMatches(route.method, method) ||
      !routePathMatches(route.path, path)
    ) {
      continue;
    }
    const score = specificity(route, method);
    if (best === undefined || compareSpecificity(score, best.score) > 0) {
      best = { route, score };
    }
  }
  return best?.route;
};

export const parseRequestTarget = (
  rawRequest: string,
): { method: string; path: string } | undefined => {
  const lineEnd = rawRequest.search(/\r?\n/);
  const requestLine =
    lineEnd === -1 ? rawRequest : rawRequest.slice(0, lineEnd);
  const [method, target] = requestLine.split(" ");
  if (method === undefined || method === "" || target === undefined) {
    return undefined;
  }
  let path = target;
  if (/^https?:\/\//i.test(target)) {
    const authorityStart = target.indexOf("//") + 2;
    const authorityLength = target.slice(authorityStart).search(/[/?#]/);
    const rest =
      authorityLength === -1
        ? ""
        : target.slice(authorityStart + authorityLength);
    path = rest.startsWith("/") ? rest : `/${rest}`;
  }
  const queryStart = path.search(/[?#]/);
  return {
    method,
    path: queryStart === -1 ? path : path.slice(0, queryStart),
  };
};
