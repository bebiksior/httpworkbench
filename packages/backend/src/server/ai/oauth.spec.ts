import { describe, expect, mock, test } from "bun:test";
import { AiOAuthService } from "./oauth";

const json = (body: unknown, status = 200) => Response.json(body, { status });

const jwt = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");

const queuedFetch = (responses: Response[]) => {
  const requests: Array<{
    url: string;
    init?: Parameters<typeof fetch>[1];
  }> = [];
  const fetchImpl = mock(
    (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      requests.push({
        url: input instanceof Request ? input.url : input.toString(),
        init,
      });
      const response = responses.shift();
      if (response === undefined) throw new Error("Unexpected request");
      return Promise.resolve(response);
    },
  ) as unknown as typeof fetch;
  return { fetchImpl, requests };
};

describe("AiOAuthService", () => {
  test("exchanges a ChatGPT device authorization and extracts its account", async () => {
    const accessToken = jwt({
      email: "user@example.com",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "account-1",
        chatgpt_plan_type: "plus",
      },
    });
    const { fetchImpl, requests } = queuedFetch([
      json({ authorization_code: "code-1", code_verifier: "verifier-1" }),
      json({
        access_token: accessToken,
        refresh_token: "refresh-1",
        expires_in: 3600,
      }),
    ]);
    const service = new AiOAuthService(fetchImpl);

    const result = await service.pollDeviceAuthorization({
      kind: "chatgpt",
      deviceAuthId: "device-1",
      userCode: "ABCD-EFGH",
    });

    expect(result).toMatchObject({
      kind: "connected",
      credentials: {
        accessToken,
        refreshToken: "refresh-1",
        accountId: "account-1",
        email: "user@example.com",
        plan: "plus",
      },
    });
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.body).toBe(
      JSON.stringify({
        device_auth_id: "device-1",
        user_code: "ABCD-EFGH",
      }),
    );
    expect(requests[1]?.url).toBe("https://auth.openai.com/oauth/token");
    expect(String(requests[1]?.init?.body)).toContain(
      "grant_type=authorization_code",
    );
    expect(requests[1]?.init?.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
  });

  test("uses xAI's minimal device scope and reports slow down", async () => {
    const { fetchImpl, requests } = queuedFetch([
      json({
        device_code: "device-1",
        user_code: "WXYZ",
        verification_uri: "https://auth.x.ai/device",
        expires_in: 300,
        interval: 5,
      }),
      json({ error: "slow_down", interval: 12 }, 400),
    ]);
    const service = new AiOAuthService(fetchImpl);

    const device = await service.requestDeviceAuthorization("xai");
    expect(device).toMatchObject({
      kind: "xai",
      deviceCode: "device-1",
      interval: 5,
    });
    expect(String(requests[0]?.init?.body)).toContain(
      "scope=openid+profile+email+offline_access+grok-cli%3Aaccess+api%3Aaccess",
    );

    await expect(
      service.pollDeviceAuthorization({ kind: "xai", deviceCode: "device-1" }),
    ).resolves.toEqual({ kind: "pending", interval: 12, slowDown: true });
  });

  test("preserves a rotating xAI refresh token when the response omits it", async () => {
    const { fetchImpl, requests } = queuedFetch([
      json({ access_token: "new-access", expires_in: 3600 }),
    ]);
    const service = new AiOAuthService(fetchImpl);

    const credentials = await service.refresh("xai", "current-refresh");

    expect(credentials.refreshToken).toBe("current-refresh");
    expect(String(requests[0]?.init?.body)).toContain(
      "refresh_token=current-refresh",
    );
  });
});
