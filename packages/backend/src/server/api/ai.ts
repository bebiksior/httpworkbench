import { Elysia, status, t } from "elysia";
import { ChatGptProxyService } from "../ai/chatGpt";
import { AiOAuthError, AiOAuthService } from "../ai/oauth";
import { authPlugin } from "../auth";
import { createFixedWindowRateLimiter } from "../rateLimit";
import { isAllowedBrowserOrigin } from "../webSocketOrigin";

const oauthService = new AiOAuthService();
const chatGptProxyService = new ChatGptProxyService();
const aiRateLimiter = createFixedWindowRateLimiter({
  maxRequests: 300,
  windowMs: 60_000,
});

const providerSchema = t.Union([t.Literal("chatgpt"), t.Literal("xai")]);

const pollSchema = t.Union([
  t.Object({
    kind: t.Literal("chatgpt"),
    deviceAuthId: t.String({ minLength: 1, maxLength: 1024 }),
    userCode: t.String({ minLength: 1, maxLength: 256 }),
  }),
  t.Object({
    kind: t.Literal("xai"),
    deviceCode: t.String({ minLength: 1, maxLength: 4096 }),
  }),
]);

const ensureAiRequestAllowed = (request: Request, userId: string) => {
  if (!isAllowedBrowserOrigin(request)) {
    return status(403, { error: "Invalid origin" });
  }
  if (!aiRateLimiter.check(userId)) {
    return status(429, { error: "AI request rate limit exceeded" });
  }
};

const oauthError = (error: unknown) => {
  if (error instanceof AiOAuthError) {
    return status(502, { error: error.message });
  }
  throw error;
};

export const aiRoutes = new Elysia({ name: "routes/ai" })
  .use(authPlugin)
  .guard({ detail: { hide: true } })
  .post(
    "/api/ai/oauth/device",
    async ({ body, request, user }) => {
      const rejected = ensureAiRequestAllowed(request, user.id);
      if (rejected !== undefined) return rejected;
      try {
        return await oauthService.requestDeviceAuthorization(body.provider);
      } catch (error) {
        return oauthError(error);
      }
    },
    {
      session: true,
      body: t.Object({ provider: providerSchema }),
    },
  )
  .post(
    "/api/ai/oauth/poll",
    async ({ body, request, user }) => {
      const rejected = ensureAiRequestAllowed(request, user.id);
      if (rejected !== undefined) return rejected;
      try {
        return await oauthService.pollDeviceAuthorization(body);
      } catch (error) {
        return oauthError(error);
      }
    },
    { session: true, body: pollSchema },
  )
  .post(
    "/api/ai/oauth/refresh",
    async ({ body, request, user }) => {
      const rejected = ensureAiRequestAllowed(request, user.id);
      if (rejected !== undefined) return rejected;
      try {
        return await oauthService.refresh(body.provider, body.refreshToken);
      } catch (error) {
        return oauthError(error);
      }
    },
    {
      session: true,
      body: t.Object({
        provider: providerSchema,
        refreshToken: t.String({ minLength: 1, maxLength: 8192 }),
      }),
    },
  )
  .post(
    "/api/ai/chatgpt/responses",
    async ({ body, request, user }) => {
      const rejected = ensureAiRequestAllowed(request, user.id);
      if (rejected !== undefined) return rejected;
      const accessToken = request.headers.get("x-ai-provider-token");
      const accountId = request.headers.get("x-ai-provider-account-id");
      if (accessToken === null || accountId === null) {
        return status(400, { error: "Missing ChatGPT credentials" });
      }
      return chatGptProxyService.forward({
        body,
        accessToken,
        accountId,
        sessionId: request.headers.get("x-ai-session-id") ?? undefined,
        signal: request.signal,
      });
    },
    { session: true, body: t.Record(t.String(), t.Any()) },
  );
