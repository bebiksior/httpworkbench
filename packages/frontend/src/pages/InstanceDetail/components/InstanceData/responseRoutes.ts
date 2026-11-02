import {
  MAX_INSTANCE_ROUTES,
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

export const isDraftDirty = (draft: RouteDraft) =>
  draft.saved === undefined ||
  !routesEqual(toInstanceRoutes([draft]), [draft.saved]);

export const toInstanceRoutes = (
  drafts: readonly RouteDraft[],
): InstanceRoute[] =>
  drafts.map(({ method, path, raw }) => ({
    ...(method === undefined ? {} : { method }),
    path: path.trim(),
    raw,
  }));

export const createRouteDraft = (raw: string): RouteDraft => ({
  key: createDraftKey(),
  path: "/",
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

const statusLineOf = (raw: string) => {
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? "";
  const match = /^HTTP\/\S+\s+(\d{3})(?:\s+(.*))?$/.exec(firstLine.trim());
  return match === null
    ? undefined
    : { code: match[1] ?? "", reason: match[2]?.trim() ?? "" };
};

export const responseSummary = (raw: string) => {
  const status = statusLineOf(raw);
  if (status === undefined) {
    return { code: "Invalid", detail: "Invalid status line" };
  }
  const location = status.code.startsWith("3")
    ? /^location:[ \t]*(.+)$/im.exec(raw.split(/\r?\n\r?\n/, 1)[0] ?? "")?.[1]
    : undefined;
  const detail = `${status.code} ${status.reason}`.trim();
  if (location === undefined) {
    return { code: status.code, detail };
  }
  const target = location.trim();
  return {
    code: `${status.code} → ${target.replace(/^https?:\/\//i, "")}`,
    detail: `${detail} → ${target}`,
  };
};
