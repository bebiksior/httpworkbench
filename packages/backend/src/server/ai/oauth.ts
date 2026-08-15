import { z } from "zod";
import type {
  AiDeviceAuthorization as DeviceAuthorization,
  AiDeviceAuthorizationPoll as DeviceAuthorizationPoll,
  AiDeviceAuthorizationResult as DeviceAuthorizationResult,
  AiSubscriptionCredentials as SubscriptionCredentials,
  AiSubscriptionProvider,
} from "shared";

const CHATGPT_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CHATGPT_ISSUER = "https://auth.openai.com";
const XAI_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const XAI_ISSUER = "https://auth.x.ai";
const XAI_SCOPES =
  "openid profile email offline_access grok-cli:access api:access";

const nonEmptyString = z.string().min(1);
const positiveNumber = z.coerce.number().positive().finite();
const oauthErrorSchema = z.object({
  error: nonEmptyString.optional(),
  error_description: nonEmptyString.optional(),
  message: nonEmptyString.optional(),
  detail: nonEmptyString.optional(),
  interval: positiveNumber.optional(),
});
const tokenResponseSchema = z.object({
  access_token: nonEmptyString,
  refresh_token: nonEmptyString.optional(),
  id_token: nonEmptyString.optional(),
  expires_in: positiveNumber.optional(),
});
const chatGptDeviceSchema = z.object({
  device_auth_id: nonEmptyString,
  user_code: nonEmptyString.optional(),
  usercode: nonEmptyString.optional(),
  interval: positiveNumber,
});
const chatGptAuthorizationSchema = z.object({
  authorization_code: nonEmptyString,
  code_verifier: nonEmptyString,
});
const xaiDeviceSchema = z.object({
  device_code: nonEmptyString,
  user_code: nonEmptyString,
  verification_uri: z.url(),
  verification_uri_complete: z.url().optional(),
  expires_in: positiveNumber,
  interval: positiveNumber.optional(),
});
const jwtClaimsSchema = z
  .object({
    exp: z.number().finite().optional(),
    email: nonEmptyString.optional(),
    chatgpt_account_id: nonEmptyString.optional(),
    organizations: z
      .array(z.object({ id: nonEmptyString }).passthrough())
      .optional(),
    "https://api.openai.com/auth": z
      .object({
        chatgpt_account_id: nonEmptyString.optional(),
        chatgpt_plan_type: nonEmptyString.optional(),
        chatgpt_account_is_fedramp: z.boolean().optional(),
      })
      .optional(),
    "https://api.openai.com/profile": z
      .object({ email: nonEmptyString.optional() })
      .optional(),
  })
  .passthrough();

type TokenResponse = z.infer<typeof tokenResponseSchema>;
type JwtClaims = z.infer<typeof jwtClaimsSchema>;

export class AiOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiOAuthError";
  }
}

const decodeJwtClaims = (token: string | undefined) => {
  const payload = token?.split(".")[1];
  if (payload === undefined) return undefined;
  try {
    const result = jwtClaimsSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
};

const readChatGptProfile = (tokens: TokenResponse) => {
  const claims = [tokens.id_token, tokens.access_token]
    .map(decodeJwtClaims)
    .filter((value) => value !== undefined);
  const find = <Value>(read: (claim: JwtClaims) => Value | undefined) =>
    claims.map(read).find((value) => value !== undefined);

  return {
    accountId: find(
      (claim) =>
        claim.chatgpt_account_id ??
        claim["https://api.openai.com/auth"]?.chatgpt_account_id ??
        claim.organizations?.[0]?.id,
    ),
    email: find(
      (claim) => claim.email ?? claim["https://api.openai.com/profile"]?.email,
    ),
    plan: find(
      (claim) => claim["https://api.openai.com/auth"]?.chatgpt_plan_type,
    ),
    isFedRamp: find(
      (claim) =>
        claim["https://api.openai.com/auth"]?.chatgpt_account_is_fedramp,
    ),
  };
};

const tokenExpiry = (tokens: TokenResponse) => {
  if (tokens.expires_in !== undefined) {
    return Date.now() + tokens.expires_in * 1000;
  }
  const exp = decodeJwtClaims(tokens.access_token)?.exp;
  return exp === undefined ? Date.now() + 60 * 60 * 1000 : exp * 1000;
};

const readErrorBody = async (response: Response) => {
  const text = (await response.text()).slice(0, 500);
  try {
    const result = oauthErrorSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : undefined;
  } catch {
    return text.startsWith("<") || text === "" ? undefined : { detail: text };
  }
};

const responseError = async (response: Response, action: string) => {
  const error = await readErrorBody(response);
  const detail =
    error?.error_description ?? error?.message ?? error?.detail ?? error?.error;
  return new AiOAuthError(
    detail === undefined
      ? `${action} failed with status ${response.status}`
      : `${action} failed: ${detail}`,
  );
};

const parseResponse = async <Schema extends z.ZodType>(
  response: Response,
  schema: Schema,
  action: string,
): Promise<z.infer<Schema>> => {
  if (!response.ok) throw await responseError(response, action);
  const result = schema.safeParse(await response.json());
  if (!result.success) {
    throw new AiOAuthError(`${action} returned an invalid response`);
  }
  return result.data;
};

const credentialsFromTokens = (
  tokens: TokenResponse,
  provider: AiSubscriptionProvider,
  previousRefreshToken?: string,
  requireChatGptAccount = false,
): SubscriptionCredentials => {
  const profile =
    provider === "chatgpt"
      ? readChatGptProfile(tokens)
      : {
          email:
            decodeJwtClaims(tokens.id_token)?.email ??
            decodeJwtClaims(tokens.access_token)?.email,
          accountId: undefined,
          plan: undefined,
          isFedRamp: undefined,
        };
  if (
    provider === "chatgpt" &&
    requireChatGptAccount &&
    profile.accountId === undefined
  ) {
    throw new AiOAuthError("ChatGPT sign in did not include an account ID");
  }
  const refreshToken = tokens.refresh_token ?? previousRefreshToken;
  if (refreshToken === undefined) {
    throw new AiOAuthError("OAuth response did not include a refresh token");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt: tokenExpiry(tokens),
    ...profile,
  };
};

const formHeaders = {
  Accept: "application/json",
  "Content-Type": "application/x-www-form-urlencoded",
};

export class AiOAuthService {
  constructor(
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async requestDeviceAuthorization(
    provider: AiSubscriptionProvider,
  ): Promise<DeviceAuthorization> {
    if (provider === "chatgpt") {
      const response = await this.fetchImpl(
        `${CHATGPT_ISSUER}/api/accounts/deviceauth/usercode`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: CHATGPT_CLIENT_ID }),
        },
      );
      const device = await parseResponse(
        response,
        chatGptDeviceSchema,
        "ChatGPT device authorization",
      );
      const userCode = device.user_code ?? device.usercode;
      if (userCode === undefined) {
        throw new AiOAuthError(
          "ChatGPT device authorization returned an invalid response",
        );
      }
      return {
        kind: "chatgpt",
        deviceAuthId: device.device_auth_id,
        userCode,
        interval: device.interval,
        verificationUri: `${CHATGPT_ISSUER}/codex/device`,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };
    }

    const response = await this.fetchImpl(`${XAI_ISSUER}/oauth2/device/code`, {
      method: "POST",
      headers: formHeaders,
      body: new URLSearchParams({
        client_id: XAI_CLIENT_ID,
        scope: XAI_SCOPES,
        referrer: "httpworkbench",
      }),
    });
    const device = await parseResponse(
      response,
      xaiDeviceSchema,
      "xAI device authorization",
    );
    const verificationUri =
      device.verification_uri_complete ?? device.verification_uri;
    if (new URL(verificationUri).protocol !== "https:") {
      throw new AiOAuthError(
        "xAI device authorization returned an insecure verification URL",
      );
    }
    return {
      kind: "xai",
      deviceCode: device.device_code,
      userCode: device.user_code,
      verificationUri,
      interval: device.interval ?? 5,
      expiresAt: Date.now() + device.expires_in * 1000,
    };
  }

  async pollDeviceAuthorization(
    poll: DeviceAuthorizationPoll,
  ): Promise<DeviceAuthorizationResult> {
    if (poll.kind === "chatgpt") {
      const response = await this.fetchImpl(
        `${CHATGPT_ISSUER}/api/accounts/deviceauth/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_auth_id: poll.deviceAuthId,
            user_code: poll.userCode,
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          return { kind: "pending" };
        }
        throw await responseError(response, "ChatGPT sign in");
      }
      const authorization = await parseResponse(
        response,
        chatGptAuthorizationSchema,
        "ChatGPT device authorization",
      );
      const tokenResponse = await this.fetchImpl(
        `${CHATGPT_ISSUER}/oauth/token`,
        {
          method: "POST",
          headers: formHeaders,
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: authorization.authorization_code,
            redirect_uri: `${CHATGPT_ISSUER}/deviceauth/callback`,
            client_id: CHATGPT_CLIENT_ID,
            code_verifier: authorization.code_verifier,
          }),
        },
      );
      const tokens = await parseResponse(
        tokenResponse,
        tokenResponseSchema,
        "ChatGPT sign in",
      );
      return {
        kind: "connected",
        credentials: credentialsFromTokens(tokens, "chatgpt", undefined, true),
      };
    }

    const response = await this.fetchImpl(`${XAI_ISSUER}/oauth2/token`, {
      method: "POST",
      headers: formHeaders,
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: poll.deviceCode,
        client_id: XAI_CLIENT_ID,
      }),
    });
    if (!response.ok) {
      const error = await readErrorBody(response);
      if (error?.error === "authorization_pending") {
        return { kind: "pending" };
      }
      if (error?.error === "slow_down") {
        return { kind: "pending", interval: error.interval, slowDown: true };
      }
      const detail = error?.error_description ?? error?.error;
      throw new AiOAuthError(
        detail === undefined
          ? `xAI sign in failed with status ${response.status}`
          : `xAI sign in failed: ${detail}`,
      );
    }
    const tokens = await parseResponse(
      response,
      tokenResponseSchema,
      "xAI sign in",
    );
    return {
      kind: "connected",
      credentials: credentialsFromTokens(tokens, "xai"),
    };
  }

  async refresh(
    provider: AiSubscriptionProvider,
    refreshToken: string,
  ): Promise<SubscriptionCredentials> {
    const isChatGpt = provider === "chatgpt";
    const issuer = isChatGpt ? CHATGPT_ISSUER : XAI_ISSUER;
    const response = await this.fetchImpl(`${issuer}/oauth/token`, {
      method: "POST",
      headers: formHeaders,
      body: new URLSearchParams({
        client_id: isChatGpt ? CHATGPT_CLIENT_ID : XAI_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const tokens = await parseResponse(
      response,
      tokenResponseSchema,
      `${isChatGpt ? "ChatGPT" : "xAI"} token refresh`,
    );
    return credentialsFromTokens(tokens, provider, refreshToken);
  }
}
