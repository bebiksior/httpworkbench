import { Elysia, status } from "elysia";
import { z } from "zod";
import {
  PhoneProviderIdSchema,
  SavePhoneProviderSchema,
  UpdatePhoneSchema,
} from "shared";
import { authPlugin } from "../auth";
import { createFixedWindowRateLimiter } from "../rateLimit";
import {
  getUserPhone,
  listPhoneProviderConfigs,
  listPhoneSms,
  listUserPhones,
  removePhoneProvider,
  savePhoneProvider,
  testPhoneProvider,
  updatePhoneNotes,
  wakeUserPhone,
  type PhoneServiceResult,
} from "../phones";

const ProviderParamsSchema = z.object({ provider: PhoneProviderIdSchema });

const SmsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Each save or test signs in to the provider, so cap how often a session can
// make this server try credentials.
const providerCheckLimiter = createFixedWindowRateLimiter({
  maxRequests: 20,
  windowMs: 60 * 60 * 1000,
});

const tooManyChecks = () =>
  status(429, { error: "Too many provider checks. Try again later." });

const respond = <T>(result: PhoneServiceResult<T>, created = false) => {
  if (!result.ok) {
    return status(result.error.status, { error: result.error.message });
  }
  return created ? status(201, result.value) : result.value;
};

export const phonesRoutes = new Elysia({ name: "routes/phones" })
  .use(authPlugin)
  .group("/api/phone-providers", { detail: { hide: true } }, (app) =>
    app
      .get("", ({ user }) => listPhoneProviderConfigs(user.id), {
        session: true,
      })
      .post(
        "",
        async ({ body, user }) =>
          providerCheckLimiter.check(user.id)
            ? respond(await savePhoneProvider(user.id, body), true)
            : tooManyChecks(),
        { session: true, body: SavePhoneProviderSchema },
      )
      .post(
        "/:provider/test",
        async ({ params, user }) =>
          providerCheckLimiter.check(user.id)
            ? respond(await testPhoneProvider(user.id, params.provider))
            : tooManyChecks(),
        { session: true, params: ProviderParamsSchema },
      )
      .delete(
        "/:provider",
        ({ params, user }) =>
          removePhoneProvider(user.id, params.provider)
            ? { message: "Deleted" }
            : status(404, { error: "Phone provider not configured" }),
        { session: true, params: ProviderParamsSchema },
      ),
  )
  .get(
    "/api/phones",
    async ({ user }) => respond(await listUserPhones(user.id)),
    {
      scope: "phones:read",
      detail: {
        tags: ["Phones"],
        summary: "List phones",
        description:
          "List the numbers from the key user's phone providers. Returns 409 when no provider is configured.",
      },
    },
  )
  .get(
    "/api/phones/:id",
    async ({ params, user }) => respond(await getUserPhone(user.id, params.id)),
    {
      scope: "phones:read",
      detail: { tags: ["Phones"], summary: "Get a phone" },
    },
  )
  .patch(
    "/api/phones/:id",
    async ({ params, body, user }) =>
      respond(await updatePhoneNotes(user.id, params.id, body.notes)),
    {
      scope: "phones:write",
      body: UpdatePhoneSchema,
      detail: {
        tags: ["Phones"],
        summary: "Update phone notes",
        description:
          "Notes are stored with the provider. An empty string clears them.",
      },
    },
  )
  .get(
    "/api/phones/:id/sms",
    async ({ params, query, user }) => {
      const result = await listPhoneSms(user.id, params.id, query.limit ?? 50);
      return result.ok ? { messages: result.value } : respond(result);
    },
    {
      scope: "phones:read",
      query: SmsQuerySchema,
      detail: {
        tags: ["Phones"],
        summary: "List SMS",
        description: "List SMS received by a phone, newest first.",
      },
    },
  )
  .post(
    "/api/phones/:id/wake",
    async ({ params, user }) =>
      respond(await wakeUserPhone(user.id, params.id)),
    {
      scope: "phones:write",
      detail: {
        tags: ["Phones"],
        summary: "Wake a phone",
        description:
          "Lines that are not always on receive SMS only inside the returned usage window.",
      },
    },
  );
