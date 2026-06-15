import { Elysia, status } from "elysia";
import { CreateApiKeySchema } from "shared";
import { deleteApiKey, getApiKeyById, getApiKeysByOwner } from "../../storage";
import { createApiKeyForUser } from "../apiKeyAuth";
import { authPlugin } from "../auth";
import { createFixedWindowRateLimiter } from "../rateLimit";

const apiKeyCreationWindowMs = 60 * 60 * 1000;
const maxApiKeyCreationsPerWindow = 10;
const maxActiveApiKeysPerUser = 50;

const apiKeyCreationRateLimiter = createFixedWindowRateLimiter({
  maxRequests: maxApiKeyCreationsPerWindow,
  windowMs: apiKeyCreationWindowMs,
});

export const apiKeysRoutes = new Elysia({ name: "routes/api-keys" })
  .use(authPlugin)
  .guard({ detail: { hide: true } })
  .get("/api/api-keys", ({ user }) => getApiKeysByOwner(user.id), {
    session: true,
  })
  .post(
    "/api/api-keys",
    ({ body, user }) => {
      if (!apiKeyCreationRateLimiter.check(user.id)) {
        return status(429, { error: "API key creation rate limit exceeded" });
      }

      const now = Date.now();
      const activeKeys = getApiKeysByOwner(user.id).filter(
        (apiKey) => apiKey.expiresAt === undefined || apiKey.expiresAt > now,
      );
      if (activeKeys.length >= maxActiveApiKeysPerUser) {
        return status(403, { error: "Active API key limit reached" });
      }

      if (body.expiresAt !== undefined && body.expiresAt <= now) {
        return status(400, { error: "Expiration must be in the future" });
      }

      const created = createApiKeyForUser({
        userId: user.id,
        name: body.name.trim(),
        scopes:
          body.scopes === undefined
            ? undefined
            : Array.from(new Set(body.scopes)),
        expiresAt: body.expiresAt,
      });
      return status(201, created);
    },
    { session: true, body: CreateApiKeySchema },
  )
  .delete(
    "/api/api-keys/:id",
    ({ params, user }) => {
      const current = getApiKeyById(params.id);
      if (current?.userId !== user.id) {
        return status(404, { error: "Not found" });
      }
      deleteApiKey(params.id);
      return { message: "Deleted" };
    },
    { session: true },
  );
