import { describe, expect, test } from "vitest";
import {
  adjustContentLength,
  parseInstanceIdFromHost,
  stripInternalHeaders,
} from "./utils";

describe("parseInstanceIdFromHost", () => {
  test("extracts the instance id from an instances subdomain host", () => {
    expect(
      parseInstanceIdFromHost("demo.instances.example.com", "example.com"),
    ).toEqual({
      kind: "ok",
      instanceId: "demo",
    });
  });

  test("uses the last host label before instances domain as instance id", () => {
    expect(
      parseInstanceIdFromHost("team.demo.instances.example.com", "example.com"),
    ).toEqual({
      kind: "ok",
      instanceId: "demo",
    });
  });

  test("returns an error when host does not belong to instances subdomain", () => {
    expect(
      parseInstanceIdFromHost("demo.api.example.com", "example.com"),
    ).toEqual({
      kind: "error",
      error: "Host does not end with instances subdomain",
    });
  });

  test("returns an error when instance id is missing", () => {
    expect(
      parseInstanceIdFromHost("instances.example.com", "example.com"),
    ).toEqual({
      kind: "error",
      error: "Host is empty",
    });
  });
});

describe("stripInternalHeaders", () => {
  test("removes selected headers case-insensitively", () => {
    const rawRequest = [
      "GET / HTTP/1.1",
      "Host: demo.instances.example.com",
      "X-Internal-Real-IP: 127.0.0.1",
      "x-internal-debug-id: test",
      "",
      "",
    ].join("\r\n");

    const stripped = stripInternalHeaders(rawRequest, [
      "x-internal-real-ip",
      "x-internal-debug-id",
    ]);

    expect(stripped).not.toContain("X-Internal-Real-IP");
    expect(stripped).not.toContain("x-internal-debug-id");
    expect(stripped).toContain("Host: demo.instances.example.com");
  });
});

describe("adjustContentLength", () => {
  test("updates content-length to the body byte size", () => {
    const body = "hello🙂";
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/plain",
      "Content-Length: 0",
      "",
      body,
    ].join("\r\n");

    const adjusted = adjustContentLength(raw);
    const expectedLength = new TextEncoder().encode(body).length;

    expect(adjusted).toContain(`Content-Length: ${expectedLength}`);
  });

  test("returns raw response unchanged if no body separator exists", () => {
    const raw = "HTTP/1.1 204 No Content\r\nContent-Length: 0";
    expect(adjustContentLength(raw)).toBe(raw);
  });
});
