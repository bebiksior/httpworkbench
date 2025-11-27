import { withAuth } from "../auth";

export const USER_ROUTES = {
  "/api/user": {
    GET: withAuth(async (_req, user) => {
      return Response.json(user, { status: 200 });
    }),
  },
} as const;
