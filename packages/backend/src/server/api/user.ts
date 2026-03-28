import type { BunRequest } from "bun";
import { acknowledgeUserNotice, getPendingNoticesForUser } from "../../storage";
import { withAuth } from "../auth";

export const USER_ROUTES = {
  "/api/user": {
    GET: withAuth(async (_req, user) => {
      return Response.json(user, { status: 200 });
    }),
  },
  "/api/user/notices": {
    GET: withAuth(async (_req, user) => {
      const notices = getPendingNoticesForUser(user.id);
      return Response.json({ notices }, { status: 200 });
    }),
  },
  "/api/user/notices/:id/ack": {
    POST: withAuth(
      async (req: BunRequest<"/api/user/notices/:id/ack">, user) => {
        const id = req.params.id;
        if (id === "") {
          return Response.json({ error: "Invalid id" }, { status: 400 });
        }
        const updated = acknowledgeUserNotice(id, user.id);
        if (updated === undefined) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(updated, { status: 200 });
      },
    ),
  },
} as const;
