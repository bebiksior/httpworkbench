import { describe, expect, mock, test } from "bun:test";
import { ChatGptProxyService, normalizeChatGptRequest } from "./chatGpt";

describe("ChatGPT Codex adapter", () => {
  test("normalizes the AI SDK Responses payload for ChatGPT", () => {
    expect(
      normalizeChatGptRequest({
        model: "gpt-5.6-sol",
        input: [],
        include: ["web_search_call.action.sources"],
        max_output_tokens: 4096,
        store: true,
      }),
    ).toEqual({
      model: "gpt-5.6-sol",
      input: [],
      instructions: "You are a helpful assistant.",
      include: [
        "web_search_call.action.sources",
        "reasoning.encrypted_content",
      ],
      store: false,
      stream: true,
    });
  });

  test("forwards credentials and streams the upstream response", async () => {
    let request:
      { url: string; init?: Parameters<typeof fetch>[1] } | undefined;
    const fetchImpl = mock(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        request = {
          url: input instanceof Request ? input.url : input.toString(),
          init,
        };
        return Promise.resolve(
          new Response("data: done\n\n", {
            headers: { "content-type": "text/event-stream" },
          }),
        );
      },
    ) as unknown as typeof fetch;
    const service = new ChatGptProxyService(fetchImpl);

    const response = await service.forward({
      body: { model: "gpt-5.6-sol", input: [], instructions: "Help" },
      accessToken: "access-1",
      accountId: "account-1",
      sessionId: "session-1",
    });

    expect(request?.url).toBe(
      "https://chatgpt.com/backend-api/codex/responses",
    );
    const headers = new Headers(request?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer access-1");
    expect(headers.get("chatgpt-account-id")).toBe("account-1");
    expect(headers.get("session-id")).toBe("session-1");
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe("data: done\n\n");
  });
});
