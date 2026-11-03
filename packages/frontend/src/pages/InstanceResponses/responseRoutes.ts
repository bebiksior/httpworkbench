import {
  MAX_INSTANCE_ROUTES,
  type Log,
  RoutePathSchema,
  routeKey,
  routeLabel as sharedRouteLabel,
  type InstanceRoute,
  type RouteMethod,
} from "shared";

export type RouteDraft = {
  key: string;
  method?: RouteMethod;
  path: string;
  raw: string;
  saved?: InstanceRoute;
};

let nextDraftKey = 0;
const createDraftKey = () => `route-${(nextDraftKey += 1)}`;

const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");

export const toRouteDrafts = (routes: readonly InstanceRoute[]): RouteDraft[] =>
  routes.map((route) => ({ ...route, key: createDraftKey(), saved: route }));

export const toInstanceRoutes = (
  drafts: readonly RouteDraft[],
): InstanceRoute[] =>
  drafts.map(({ method, path, raw }) => ({
    ...(method === undefined ? {} : { method }),
    path: path.trim(),
    raw,
  }));

export const createRouteDraft = (raw: string, path = "/"): RouteDraft => ({
  key: createDraftKey(),
  path,
  raw,
});

export const canAddRoute = (drafts: readonly RouteDraft[]) =>
  drafts.length < MAX_INSTANCE_ROUTES;

const pathProblem = (path: string) => {
  if (path === "") return "Required";
  if (!path.startsWith("/")) return "Must start with /";
  if (/[\s?#]/.test(path)) return "No spaces, ? or #";
  return RoutePathSchema.safeParse(path).success ? undefined : "Too long";
};

export const validateRouteDrafts = (
  drafts: readonly RouteDraft[],
): Record<string, string> => {
  const errors: Record<string, string> = {};
  const byKey = new Map<string, string[]>();
  for (const draft of drafts) {
    const path = draft.path.trim();
    const problem = pathProblem(path);
    if (problem !== undefined) {
      errors[draft.key] = problem;
      continue;
    }
    const key = routeKey({ method: draft.method, path });
    byKey.set(key, [...(byKey.get(key) ?? []), draft.key]);
  }
  for (const keys of byKey.values()) {
    if (keys.length > 1) {
      for (const key of keys) {
        errors[key] = "Duplicate";
      }
    }
  }
  return errors;
};

export const routesEqual = (
  a: readonly InstanceRoute[],
  b: readonly InstanceRoute[],
) =>
  a.length === b.length &&
  a.every((route, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      route.method === other.method &&
      route.path === other.path &&
      normalizeLineEndings(route.raw) === normalizeLineEndings(other.raw)
    );
  });

export const routeLabel = (route: Pick<RouteDraft, "method" | "path">) =>
  sharedRouteLabel({ method: route.method, path: route.path.trim() });

export const statusCode = (raw: string) =>
  /^HTTP\/\S+\s+(\d{3})\b/.exec(raw.trimStart())?.[1];

type RoutePattern = Pick<RouteDraft, "method" | "path">;

const literalLength = (path: string) => path.replaceAll("*", "").length;

const compareRoutePriority = (a: RoutePattern, b: RoutePattern) => {
  const pathA = a.path.trim();
  const pathB = b.path.trim();
  const wildA = pathA.includes("*");
  const wildB = pathB.includes("*");
  if (wildA !== wildB) return wildA ? 1 : -1;
  if (wildA) {
    const difference = literalLength(pathB) - literalLength(pathA);
    if (difference !== 0) return difference;
  }
  return (
    pathA.localeCompare(pathB) ||
    Number(a.method === undefined) - Number(b.method === undefined) ||
    (a.method ?? "").localeCompare(b.method ?? "")
  );
};

export const priorityOrder = (drafts: readonly RouteDraft[]) =>
  [...drafts].sort(compareRoutePriority).map((draft) => draft.key);

export const arrangeByOrder = (
  drafts: readonly RouteDraft[],
  order: readonly string[],
) => {
  const byKey = new Map(drafts.map((draft) => [draft.key, draft]));
  const listed = order.flatMap((key) => byKey.get(key) ?? []);
  const placed = new Set(order);
  return [...listed, ...drafts.filter((draft) => !placed.has(draft.key))];
};

export const adjacentKey = (
  keys: readonly string[],
  current: string,
  step: 1 | -1,
) => {
  const index = keys.indexOf(current);
  if (index === -1) return keys[0] ?? current;
  return keys[index + step] ?? current;
};

export const routeUrl = (baseUrl: string, path: string | undefined) => {
  const trimmed = path?.trim() ?? "";
  if (!trimmed.startsWith("/")) return `${baseUrl}/`;
  const wildcard = trimmed.indexOf("*");
  return `${baseUrl}${wildcard === -1 ? trimmed : trimmed.slice(0, wildcard)}`;
};

export const servedStats = (
  logs: readonly Log[],
  label: string | undefined,
) => {
  let count = 0;
  let lastAt: number | undefined;
  for (const log of logs) {
    if (log.type !== "http" || log.route !== label) continue;
    count += 1;
    if (lastAt === undefined || log.timestamp > lastAt) {
      lastAt = log.timestamp;
    }
  }
  return { count, lastAt };
};
