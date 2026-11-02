import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { dnsConfig } from "../config";
import { authenticateApiKeyRequest } from "./apiKeyAuth";
import { publicInstancePageUrl } from "./mcp/context";
import { registerInstanceTools } from "./mcp/instanceTools";
import { registerLogTools } from "./mcp/logTools";
import { createFixedWindowRateLimiter } from "./rateLimit";

const mcpRateLimitWindowMs = 60_000;
const mcpRateLimiter = createFixedWindowRateLimiter({
  maxRequests: 120,
  windowMs: mcpRateLimitWindowMs,
});
const unauthMcpRateLimiter = createFixedWindowRateLimiter({
  maxRequests: 600,
  windowMs: mcpRateLimitWindowMs,
});

const instancesDomain = dnsConfig.instancesDomain;

const mcpServerInstructions = `
HTTP Workbench helps pentesters and security researchers host proof-of-concept HTTP responses and capture HTTP, DNS and SMTP interactions for authorized security testing.

An instance is the hostname <id>.${instancesDomain}. It serves a raw HTTP response and records every request it receives. Deployments with DNS or SMTP enabled also record DNS lookups and email for its hostnames.

Reuse instances instead of creating one per probe:
- Every name under an instance logs to it: <anything>.<id>.${instancesDomain} for HTTP and DNS, and user@<anything>.<id>.${instancesDomain} for SMTP. Put a unique token per probe in that label, e.g. avatar-ssrf.<id>.${instancesDomain}, and find it in the logs.
- Paths and query strings are logged too, so https://<id>.${instancesDomain}/<probe-name> also tells probes apart.
- To serve several responses (redirect hops, content types, status codes, multi-step PoCs), add per-path responses with set_instance_route. The instance's raw response is the fallback for paths without a route.
- To change a response, update the instance you already have.
- Before creating an instance, look for one to reuse with list_instances (query or labelPrefix). Label new instances with the target and purpose.

Instances created here expire after 72 hours by default. Use extend_instance when you need one longer. When an instance becomes evidence in a report, lock it with set_instance_locked: it can no longer be deleted and its lifetime is extended to the maximum. When you are done, clean up with delete_instance or delete_instances.

Raw responses must be complete: status line, headers, a blank line, and body. Line endings are normalized, Content-Length is set automatically, size limits are enforced, and invalid HTTP is rejected.

Publishing an instance lets an unauthenticated user visit ${publicInstancePageUrl} and view its logs and basic data. Access is read-only. This is useful when sharing callback information with a triager in a vulnerability report.

Use watch_instance_logs by polling again with resumeCursor after pollAfterMs when the user is actively waiting for new interactions. nextCursor only indicates another historical page is already available.
`.trim();

const frontendUrl = Bun.env.FRONTEND_URL;
const configuredDomain = Bun.env.DOMAIN;
const allowedOrigins = new Set(
  [frontendUrl, "http://localhost:5173", "http://127.0.0.1:5173"].filter(
    (value): value is string => value !== undefined && value !== "",
  ),
);
const allowedHosts = new Set(
  [
    configuredDomain,
    frontendUrl === undefined || frontendUrl === ""
      ? undefined
      : new URL(frontendUrl).host,
    "localhost",
    "127.0.0.1",
    "localhost:8081",
    "127.0.0.1:8081",
  ].filter((value): value is string => value !== undefined && value !== ""),
);

const validateMcpHeaders = (request: Request): Response | undefined => {
  const host = request.headers.get("host");
  if (host === null || !allowedHosts.has(host)) {
    return new Response("Invalid host", { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin !== null && !allowedOrigins.has(origin)) {
    return new Response("Invalid origin", { status: 403 });
  }
  return undefined;
};

const createMcpServer = () => {
  const server = new McpServer(
    { name: "httpworkbench", version: "1.0.0" },
    { instructions: mcpServerInstructions },
  );
  registerInstanceTools(server);
  registerLogTools(server);
  return server;
};

const mcpHandler = createMcpHandler(createMcpServer);

export const closeMcpHandler = () => mcpHandler.close();

export const handleMcpRequest = async (request: Request): Promise<Response> => {
  const headerError = validateMcpHeaders(request);
  if (headerError !== undefined) {
    return headerError;
  }

  const auth = authenticateApiKeyRequest(request);
  if (auth === undefined) {
    if (!unauthMcpRateLimiter.check("unauthenticated")) {
      return new Response("Rate limit exceeded", { status: 429 });
    }
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="httpworkbench-mcp"' },
    });
  }
  if (!mcpRateLimiter.check(auth.apiKey.id)) {
    return new Response("Rate limit exceeded", { status: 429 });
  }

  return mcpHandler.fetch(request, {
    authInfo: {
      token: auth.apiKey.id,
      clientId: auth.apiKey.id,
      scopes: auth.apiKey.scopes,
      expiresAt:
        auth.apiKey.expiresAt === undefined
          ? undefined
          : Math.floor(auth.apiKey.expiresAt / 1000),
      extra: { httpworkbenchAuth: auth },
    },
  });
};
