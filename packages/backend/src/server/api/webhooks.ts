import type { BunRequest } from "bun";
import { CreateWebhookSchema, UpdateWebhookSchema } from "shared";
import {
  addWebhook,
  deleteWebhook,
  getWebhookById,
  getWebhooksByOwner,
  updateWebhook,
} from "../../storage";
import { withAuth } from "../auth";
import { parseJsonRequest } from "../utils";
import { validateDiscordWebhookUrl } from "../webhookService";

export const WEBHOOKS_ROUTES = {
  "/api/webhooks": {
    GET: withAuth(async (_req: BunRequest<"/api/webhooks">, user) => {
      const webhooks = await getWebhooksByOwner(user.id);
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

      const webhook = await addWebhook({
        id: crypto.randomUUID(),
        name: parsed.data.name,
        url: parsed.data.url,
        ownerId: user.id,
        createdAt: Date.now(),
      });

      return Response.json(webhook, { status: 201 });
    }),
  },
  "/api/webhooks/:id": {
    PATCH: withAuth(async (req: BunRequest<"/api/webhooks/:id">, user) => {
      const id = req.params.id;
      if (id === "") {
        return Response.json({ error: "Invalid id" }, { status: 400 });
      }

      const webhook = await getWebhookById(id);
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

      const updatedWebhook = await updateWebhook(id, {
        name: parsed.data.name,
        url: parsed.data.url,
      });

      return Response.json(updatedWebhook, { status: 200 });
    }),
    DELETE: withAuth(async (req: BunRequest<"/api/webhooks/:id">, user) => {
      const id = req.params.id;
      if (id === "") {
        return Response.json({ error: "Invalid id" }, { status: 400 });
      }

      const webhook = await getWebhookById(id);
      if (webhook === undefined) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (webhook.ownerId !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      await deleteWebhook(id);
      return Response.json({ message: "Deleted" }, { status: 200 });
    }),
  },
} as const;
