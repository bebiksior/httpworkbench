import type { BunRequest } from "bun";
import { CreateApiKeySchema } from "shared";
import { deleteApiKey, getApiKeyById, getApiKeysByOwner } from "../../storage";
import { createApiKeyForUser } from "../apiKeyAuth";
import { withAuth } from "../auth";
import { createFixedWindowRateLimiter } from "../rateLimit";
import { parseJsonRequest } from "../utils";

const apiKeyCreationWindowMs = 60 * 60 * 1000;
const maxApiKeyCreationsPerWindow = 10;
const maxActiveApiKeysPerUser = 50;

const apiKeyCreationRateLimiter = createFixedWindowRateLimiter({
  maxRequests: maxApiKeyCreationsPerWindow,
  windowMs: apiKeyCreationWindowMs,
});

export const API_KEYS_ROUTES = {
  "/api/api-keys": {
    GET: withAuth(async (_req: BunRequest<"/api/api-keys">, user) => {
      const apiKeys = getApiKeysByOwner(user.id);
      return Response.json(apiKeys, { status: 200 });
    }),
    POST: withAuth(async (req: BunRequest<"/api/api-keys">, user) => {
      const parsed = await parseJsonRequest(req, CreateApiKeySchema);
      if (parsed.kind === "error") {
        return parsed.response;
      }

      if (!apiKeyCreationRateLimiter.check(user.id)) {
        return Response.json(
          { error: "API key creation rate limit exceeded" },
          { status: 429 },
        );
      }

      const now = Date.now();
      const activeKeys = getApiKeysByOwner(user.id).filter(
        (apiKey) => apiKey.expiresAt === undefined || apiKey.expiresAt > now,
      );
      if (activeKeys.length >= maxActiveApiKeysPerUser) {
        return Response.json(
          { error: "Active API key limit reached" },
          { status: 403 },
        );
      }

      if (parsed.data.expiresAt !== undefined && parsed.data.expiresAt <= now) {
        return Response.json(
          { error: "Expiration must be in the future" },
          { status: 400 },
        );
      }

      const created = createApiKeyForUser({
        userId: user.id,
        name: parsed.data.name.trim(),
        scopes:
          parsed.data.scopes === undefined
            ? undefined
            : Array.from(new Set(parsed.data.scopes)),
        expiresAt: parsed.data.expiresAt,
      });

      return Response.json(created, { status: 201 });
    }),
  },
  "/api/api-keys/:id": {
    DELETE: withAuth(async (req: BunRequest<"/api/api-keys/:id">, user) => {
      const id = req.params.id;
      if (id === "") {
        return Response.json({ error: "Invalid id" }, { status: 400 });
      }

      const current = getApiKeyById(id);
      if (current === undefined) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (current.userId !== user.id) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }

      deleteApiKey(id);
      return Response.json({ message: "Deleted" }, { status: 200 });
    }),
  },
} as const;
