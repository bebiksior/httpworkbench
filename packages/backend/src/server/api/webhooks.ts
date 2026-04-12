import type { BunRequest } from "bun";
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
import { withAuth } from "../auth";
import { parseJsonRequest } from "../utils";
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

export const WEBHOOKS_ROUTES = {
  "/api/webhooks": {
    GET: withAuth(async (_req: BunRequest<"/api/webhooks">, user) => {
      const webhooks = getWebhooksByOwner(user.id);
      return Response.json(webhooks, { status: 200 });
    }),
    POST: withAuth(async (req: BunRequest<"/api/webhooks">, user) => {
      const parsed = await parseJsonRequest(req, CreateWebhookSchema);
      if (parsed.kind === "error") {
        return parsed.response;
      }

      const validation = validateDiscordWebhookUrl(parsed.data.url);
      if (!validation.valid) {
        return Response.json(
          { error: validation.error ?? "Invalid webhook URL" },
          { status: 400 },
        );
      }

      const webhook = addWebhook({
        id: crypto.randomUUID(),
        name: parsed.data.name,
        url: parsed.data.url,
        message: normalizeWebhookMessage(parsed.data.message),
        ownerId: user.id,
        createdAt: Date.now(),
      });

      return Response.json(webhook, { status: 201 });
    }),
  },
  "/api/webhooks/test": {
    POST: withAuth(async (req: BunRequest<"/api/webhooks/test">, _user) => {
      const parsed = await parseJsonRequest(req, TestWebhookSchema);
      if (parsed.kind === "error") {
        return parsed.response;
      }

      const normalizedMessage = normalizeWebhookMessage(parsed.data.message);
      const validation = validateDiscordWebhookUrl(parsed.data.url);
      if (!validation.valid) {
        return Response.json(
          { error: validation.error ?? "Invalid webhook URL" },
          { status: 400 },
        );
      }

      try {
        await sendDiscordTestNotification({
          url: parsed.data.url,
          message: normalizedMessage,
        });
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to send test webhook notification",
          },
          { status: 502 },
        );
      }

      return new Response(null, { status: 204 });
    }),
  },
  "/api/webhooks/:id": {
    PATCH: withAuth(async (req: BunRequest<"/api/webhooks/:id">, user) => {
      const id = req.params.id;
      if (id === "") {
        return Response.json({ error: "Invalid id" }, { status: 400 });
      }

      const webhook = getWebhookById(id);
      if (webhook === undefined) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (webhook.ownerId !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const parsed = await parseJsonRequest(req, UpdateWebhookSchema);
      if (parsed.kind === "error") {
        return parsed.response;
      }

      const validation = validateDiscordWebhookUrl(parsed.data.url);
      if (!validation.valid) {
        return Response.json(
          { error: validation.error ?? "Invalid webhook URL" },
          { status: 400 },
        );
      }

      const updatedWebhook = updateWebhook(id, {
        name: parsed.data.name,
        url: parsed.data.url,
        message: normalizeWebhookMessage(parsed.data.message),
      });

      return Response.json(updatedWebhook, { status: 200 });
    }),
    DELETE: withAuth(async (req: BunRequest<"/api/webhooks/:id">, user) => {
      const id = req.params.id;
      if (id === "") {
        return Response.json({ error: "Invalid id" }, { status: 400 });
      }

      const webhook = getWebhookById(id);
      if (webhook === undefined) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (webhook.ownerId !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      deleteWebhook(id);
      return Response.json({ message: "Deleted" }, { status: 200 });
    }),
  },
} as const;
