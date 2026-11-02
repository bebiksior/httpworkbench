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

const suggestPath = (drafts: readonly RouteDraft[]) => {
  const taken = new Set(drafts.map((draft) => draft.path));
  for (let index = 1; ; index += 1) {
    const path = `/path-${index}`;
    if (!taken.has(path)) {
      return path;
    }
  }
};

export const createRouteDraft = (
  drafts: readonly RouteDraft[],
  raw: string,
): RouteDraft => ({ key: createDraftKey(), path: suggestPath(drafts), raw });

export const canAddRoute = (drafts: readonly RouteDraft[]) =>
  drafts.length < MAX_INSTANCE_ROUTES;

export const validateRouteDrafts = (
  drafts: readonly RouteDraft[],
): Record<string, string> => {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  for (const draft of drafts) {
    const path = draft.path.trim();
    const parsed = RoutePathSchema.safeParse(path);
    if (!parsed.success) {
      errors[draft.key] =
        path === ""
          ? "Enter a path"
          : (parsed.error.issues[0]?.message ?? "Invalid path");
      continue;
    }
    const key = routeKey({ method: draft.method, path });
    if (seen.has(key)) {
      errors[draft.key] = "This path already has a response";
      continue;
    }
    seen.add(key);
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
