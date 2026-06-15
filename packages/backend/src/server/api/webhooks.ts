import { Elysia, status } from "elysia";
import {
  CreateWebhookSchema,
  TestWebhookSchema,
  UpdateWebhookSchema,
} from "shared";
import {
  addWebhook,
  deleteWebhook,
  getWebhookById,
  getWebhooksByOwner,
  updateWebhook,
} from "../../storage";
import { authPlugin } from "../auth";
import {
  sendDiscordTestNotification,
  validateDiscordWebhookUrl,
} from "../webhooks";

const normalizeWebhookMessage = (message?: string) => {
  if (message === undefined) {
    return undefined;
  }
  const normalized = message.trim();
  return normalized === "" ? undefined : normalized;
};

export const webhooksRoutes = new Elysia({ name: "routes/webhooks" })
  .use(authPlugin)
  .guard({ detail: { hide: true } })
  .get("/api/webhooks", ({ user }) => getWebhooksByOwner(user.id), {
    session: true,
  })
  .post(
    "/api/webhooks",
    ({ body, user }) => {
      const validation = validateDiscordWebhookUrl(body.url);
      if (!validation.valid) {
        return status(400, {
          error: validation.error ?? "Invalid webhook URL",
        });
      }
      const webhook = addWebhook({
        id: crypto.randomUUID(),
        name: body.name,
        url: body.url,
        message: normalizeWebhookMessage(body.message),
        ownerId: user.id,
        createdAt: Date.now(),
      });
      return status(201, webhook);
    },
    { session: true, body: CreateWebhookSchema },
  )
  .post(
    "/api/webhooks/test",
    async ({ body }) => {
      const validation = validateDiscordWebhookUrl(body.url);
      if (!validation.valid) {
        return status(400, {
          error: validation.error ?? "Invalid webhook URL",
        });
      }
      try {
        await sendDiscordTestNotification({
          url: body.url,
          message: normalizeWebhookMessage(body.message),
        });
      } catch (error) {
        return status(502, {
          error:
            error instanceof Error
              ? error.message
              : "Failed to send test webhook notification",
        });
      }
      return status(204);
    },
    { session: true, body: TestWebhookSchema },
  )
  .patch(
    "/api/webhooks/:id",
    ({ params, body, user }) => {
      const webhook = getWebhookById(params.id);
      if (webhook === undefined) {
        return status(404, { error: "Not found" });
      }
      if (webhook.ownerId !== user.id) {
        return status(403, { error: "Forbidden" });
      }
      const validation = validateDiscordWebhookUrl(body.url);
      if (!validation.valid) {
        return status(400, {
          error: validation.error ?? "Invalid webhook URL",
        });
      }
      const updated = updateWebhook(params.id, {
        name: body.name,
        url: body.url,
        message: normalizeWebhookMessage(body.message),
      });
      if (updated === undefined) {
        return status(404, { error: "Not found" });
      }
      return updated;
    },
    { session: true, body: UpdateWebhookSchema },
  )
  .delete(
    "/api/webhooks/:id",
    ({ params, user }) => {
      const webhook = getWebhookById(params.id);
      if (webhook === undefined) {
        return status(404, { error: "Not found" });
      }
      if (webhook.ownerId !== user.id) {
        return status(403, { error: "Forbidden" });
      }
      deleteWebhook(params.id);
      return { message: "Deleted" };
    },
    { session: true },
  );
