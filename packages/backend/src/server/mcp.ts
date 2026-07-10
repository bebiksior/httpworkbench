import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiKeyRequest } from "./apiKeyAuth";
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

const mcpServerInstructions = `
HTTP Workbench helps pentesters and security researchers create temporary hosted HTTP proof-of-concept pages and observe HTTP/DNS/SMTP interactions for authorized security testing.

An instance is a hosted subdomain under the configured instances domain. It serves an exact raw HTTP response and records incoming HTTP requests. Deployments with DNS enabled also record DNS lookups for instance hostnames.

Create and update tools require a complete raw HTTP response: status line, headers, a blank line, and body. They normalize line endings, enforce response size limits, and reject invalid HTTP.

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

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request, {
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
  } finally {
    await transport.close();
    await server.close();
  }
};
