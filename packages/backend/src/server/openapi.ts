import { openapi } from "@elysiajs/openapi";

const apiVersion = "1.0.0";

const resolveServerUrl = (): string => {
  const frontendUrl = Bun.env.FRONTEND_URL;
  if (frontendUrl !== undefined && frontendUrl !== "") {
    return frontendUrl.replace(/\/+$/, "");
  }
  return `http://localhost:${Bun.env.API_PORT ?? "8081"}`;
};

const description = [
  "Programmatic access to HTTP Workbench instances and their recorded HTTP/DNS interaction logs.",
  "",
  "## Authentication",
  "",
  "All endpoints require a bearer API key, created in the dashboard under Settings → API Keys:",
  "",
  "```",
  "Authorization: Bearer hwb_<id>_<secret>",
  "```",
  "",
  "## Scopes",
  "",
  "A request needing a scope the key does not hold is rejected with `403`.",
  "",
  "| Scope | Grants |",
  "| --- | --- |",
  "| `instances:read` | List and read your instances |",
  "| `instances:write` | Create, replace, rename, lock, publish, extend, clear logs |",
  "| `instances:delete` | Delete instances |",
  "| `logs:read` | Read instance logs |",
  "",
  "A key only acts on instances owned by its user; others return `404`.",
].join("\n");

export const openApiPlugin = () =>
  openapi({
    provider: "scalar",
    path: "/docs",
    specPath: "/api/openapi.json",
    documentation: {
      info: {
        title: "HTTP Workbench API",
        version: apiVersion,
        description,
      },
      servers: [
        { url: resolveServerUrl(), description: "Configured deployment" },
      ],
      tags: [
        {
          name: "Instances",
          description: "Create and manage hosted HTTP response instances.",
        },
        {
          name: "Logs",
          description: "Read and clear recorded HTTP/DNS interaction logs.",
        },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "hwb_<id>_<secret>",
            description:
              "HTTP Workbench API key, sent as `Authorization: Bearer hwb_<id>_<secret>`.",
          },
        },
      },
      security: [{ ApiKeyAuth: [] }],
    },
  });
