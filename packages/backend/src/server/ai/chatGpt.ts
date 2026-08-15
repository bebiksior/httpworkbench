const CHATGPT_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const normalizeChatGptRequest = (body: unknown) => {
  if (!isRecord(body)) {
    throw new Error("Invalid ChatGPT request body");
  }

  const include = Array.isArray(body.include)
    ? body.include.filter((value): value is string => typeof value === "string")
    : [];
  if (!include.includes("reasoning.encrypted_content")) {
    include.push("reasoning.encrypted_content");
  }

  const normalized: JsonRecord = {
    ...body,
    instructions:
      typeof body.instructions === "string" && body.instructions.trim() !== ""
        ? body.instructions
        : "You are a helpful assistant.",
    include,
    store: false,
    stream: true,
  };
  delete normalized.max_output_tokens;
  return normalized;
};

export class ChatGptProxyService {
  constructor(private readonly fetchImpl: typeof globalThis.fetch = fetch) {}

  async forward({
    body,
    accessToken,
    accountId,
    sessionId,
    signal,
  }: {
    body: unknown;
    accessToken: string;
    accountId: string;
    sessionId?: string;
    signal?: AbortSignal;
  }) {
    const headers = new Headers({
      Accept: "text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      "ChatGPT-Account-Id": accountId,
      "Content-Type": "application/json",
      "OpenAI-Beta": "responses=experimental",
      originator: "httpworkbench",
      "User-Agent": "httpworkbench",
    });
    if (sessionId !== undefined && sessionId !== "") {
      headers.set("session-id", sessionId);
    }

    const response = await this.fetchImpl(CHATGPT_RESPONSES_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(normalizeChatGptRequest(body)),
      signal,
    });

    const responseHeaders = new Headers();
    for (const name of [
      "content-type",
      "openai-processing-ms",
      "x-request-id",
    ]) {
      const value = response.headers.get(name);
      if (value !== null) {
        responseHeaders.set(name, value);
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }
}
