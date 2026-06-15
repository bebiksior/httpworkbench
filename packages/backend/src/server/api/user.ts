import { Elysia, status } from "elysia";
import { acknowledgeUserNotice, getPendingNoticesForUser } from "../../storage";
import { authPlugin } from "../auth";

export const userRoutes = new Elysia({ name: "routes/user" })
  .use(authPlugin)
  .guard({ detail: { hide: true } })
  .get("/api/user", ({ user }) => user, { session: true })
  .get(
    "/api/user/notices",
    ({ user }) => ({ notices: getPendingNoticesForUser(user.id) }),
    { session: true },
  )
  .post(
    "/api/user/notices/:id/ack",
    ({ params, user }) => {
      const updated = acknowledgeUserNotice(params.id, user.id);
      if (updated === undefined) {
        return status(404, { error: "Not found" });
      }
      return updated;
    },
    { session: true },
  );
