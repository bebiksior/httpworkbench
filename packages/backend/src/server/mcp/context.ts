import type { ServerContext } from "@modelcontextprotocol/server";
import type { ApiKeyScope, Instance, InstanceSummary } from "shared";
import type { ApiKeyAuthContext } from "../apiKeyAuth";
import { hasApiKeyScope } from "../apiKeyAuth";
import { getOwnedInstance } from "../instances/service";

export const jsonToolResult = (value: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
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

export const serializeInstance = (instance: Instance) => ({
  ...instance,
  url: `${instance.id}.${Bun.env.INSTANCES_DOMAIN ?? ""}`,
});

export const serializeInstanceSummary = (instance: InstanceSummary) => ({
  id: instance.id,
  ownerId: instance.ownerId,
  createdAt: instance.createdAt,
  expiresAt: instance.expiresAt,
  label: instance.label,
  public: instance.public,
  locked: instance.locked,
  logCount: instance.logCount,
  url: `${instance.id}.${Bun.env.INSTANCES_DOMAIN ?? ""}`,
});
