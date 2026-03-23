import type { BunRequest } from "bun";
import { dnsConfig, getCaddyAskSecret } from "../../config";
import { getInstanceById } from "../../storage/repositories/instances";
import { parseInstanceIdFromHost } from "../instances/utils";

export const INTERNAL_ROUTES = {
  "/api/internal/tls/allow": {
    GET: async (req: BunRequest<"/api/internal/tls/allow">) => {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      const domain = url.searchParams.get("domain");

      const caddyAskSecret = getCaddyAskSecret();
      if (caddyAskSecret === undefined || caddyAskSecret === "") {
        return new Response("Forbidden", { status: 403 });
      }

      if (token !== caddyAskSecret) {
        return new Response("Forbidden", { status: 403 });
      }

      if (domain === null || domain.trim() === "") {
        return new Response("Missing domain", { status: 400 });
      }

      const result = parseInstanceIdFromHost(domain, dnsConfig.instancesDomain);
      if (result.kind === "error") {
        return new Response("Forbidden", { status: 403 });
      }

      const instance = await getInstanceById(result.instanceId);
      if (instance === undefined) {
        return new Response("Forbidden", { status: 403 });
      }

      return new Response("OK", { status: 200 });
    },
  },
} as const;
