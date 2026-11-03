import type { ServerContext } from "@modelcontextprotocol/server";
import {
  routeLabel,
  type ApiKeyScope,
  type Instance,
  type InstanceSummary,
} from "shared";
import type { ApiKeyAuthContext } from "../apiKeyAuth";
import { dnsConfig } from "../../config";
import { hasApiKeyScope } from "../apiKeyAuth";
import { getOwnedInstance } from "../instances/service";

export const jsonToolResult = (value: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value,
});

export const toolError = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

export const getAuthContext = (extra: Pick<ServerContext, "http">) => {
  const context = extra.http?.authInfo?.extra?.httpworkbenchAuth;
  if (context === undefined) {
    throw new Error("Unauthorized");
  }
  return context as ApiKeyAuthContext;
};

export const requireScope = (auth: ApiKeyAuthContext, scope: ApiKeyScope) => {
  if (!hasApiKeyScope(auth.apiKey, scope)) {
    throw new Error(`Missing API key scope: ${scope}`);
  }
};

export const requireOwnedInstance = (
  instanceId: string,
  auth: ApiKeyAuthContext,
) => {
  const result = getOwnedInstance(instanceId, auth.user.id);
  if (!result.ok) {
    throw new Error("Instance not found");
  }
  return result.value;
};

export const publicInstancePageUrl = `${(Bun.env.FRONTEND_URL ?? "https://httpworkbench.com").replace(/\/+$/, "")}/instances/:id`;

const instanceUrl = (id: string) => `${id}.${dnsConfig.instancesDomain}`;

export const serializeInstance = (instance: Instance) => ({
  id: instance.id,
  label: instance.label,
  url: instanceUrl(instance.id),
  createdAt: instance.createdAt,
  expiresAt: instance.expiresAt,
  public: instance.public,
  locked: instance.locked,
  webhookIds: instance.webhookIds,
  raw: instance.raw,
  routes: instance.routes,
});

export const serializeInstanceChange = (instance: Instance) => ({
  id: instance.id,
  label: instance.label,
  url: instanceUrl(instance.id),
  expiresAt: instance.expiresAt,
  public: instance.public,
  locked: instance.locked,
  routes: instance.routes.map(routeLabel),
});

export const serializeInstanceSummary = (instance: InstanceSummary) => ({
  id: instance.id,
  label: instance.label,
  url: instanceUrl(instance.id),
  createdAt: instance.createdAt,
  expiresAt: instance.expiresAt,
  logCount: instance.logCount,
  public: instance.public,
  locked: instance.locked,
});
