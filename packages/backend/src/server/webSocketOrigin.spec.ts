import { describe, expect, test } from "bun:test";
import { isAllowedWebSocketOrigin } from "./webSocketOrigin";

const request = (url: string, origin?: string) =>
  new Request(url, {
    headers: origin === undefined ? undefined : { origin },
  });

describe("websocket origin validation", () => {
  test("allows the configured frontend and non-browser clients", () => {
    expect(
      isAllowedWebSocketOrigin(
        request("https://api.example.com/ws", "https://app.example.com"),
        "https://app.example.com",
      ),
    ).toBe(true);
    expect(
      isAllowedWebSocketOrigin(request("https://api.example.com/ws")),
    ).toBe(true);
  });

  test("rejects sibling and attacker origins", () => {
    expect(
      isAllowedWebSocketOrigin(
        request(
          "https://httpworkbench.com/ws",
          "https://attacker.instances.httpworkbench.com",
        ),
        "https://httpworkbench.com",
      ),
    ).toBe(false);
    expect(
      isAllowedWebSocketOrigin(
        request("https://api.example.com/ws", "not-an-origin"),
        "https://app.example.com",
      ),
    ).toBe(false);
  });

  test("allows local frontend proxies only for loopback backends", () => {
    expect(
      isAllowedWebSocketOrigin(
        request("http://localhost:8081/ws", "http://localhost:5173"),
        "https://app.example.com",
      ),
    ).toBe(true);
    expect(
      isAllowedWebSocketOrigin(
        request("https://api.example.com/ws", "http://localhost:5173"),
        "https://app.example.com",
      ),
    ).toBe(false);
  });
});
