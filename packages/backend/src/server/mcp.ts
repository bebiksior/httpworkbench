import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { dnsConfig, mailSendingConfig, smtpConfig } from "../config";
import { authenticateApiKeyRequest } from "./apiKeyAuth";
import { registerInstanceTools } from "./mcp/instanceTools";
import { registerLogTools } from "./mcp/logTools";
import { registerMailboxTools } from "./mcp/mailboxTools";
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

const mailboxInstructions = smtpConfig.smtpEnabled
  ? `
Mailboxes are temporary email inboxes at <id>.${instancesDomain}, separate from instances. Any address at the mailbox host lands in its inbox, so use one mailbox per target and tell signups apart by local part, e.g. admin+reset@<id>.${instancesDomain}. Wait for mail with watch_mailbox and read it with read_message, which lists the links it contains.${mailSendingConfig.enabled ? " Send mail from a mailbox with send_email." : ""}`
  : "";

const mcpServerInstructions = `
HTTP Workbench hosts proof-of-concept HTTP responses and captures HTTP, DNS and SMTP interactions for authorized security testing.

An instance is the hostname <id>.${instancesDomain}. It serves a raw HTTP response and logs every request to it and to any name under it: <anything>.<id>.${instancesDomain} for HTTP and DNS, user@<anything>.<id>.${instancesDomain} for SMTP (when enabled).

Reuse instances instead of creating one per probe:
- Tell probes apart with a unique label or path, e.g. avatar-ssrf.<id>.${instancesDomain} or /avatar-ssrf.
- Serve different responses per path with set_instance_route. The instance's raw response is the fallback.
- Look for an instance to reuse with list_instances before creating one, and label new ones with the target and purpose.

Instances created here expire after 72 hours unless extended with extend_instance. Lock instances that become evidence with set_instance_locked. Clean up with delete_instance or delete_instances when done.

Raw responses need a status line, headers, a blank line and a body. Line endings are normalized and Content-Length is set automatically.

When the user is waiting for interactions, call watch_instance_logs again with resumeCursor after pollAfterMs.
${mailboxInstructions}`.trim();

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
  registerMailboxTools(server);
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
