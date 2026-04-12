import { expect, test } from "vitest";
import { HttpRequestBuffer } from "./httpBuffer";

const encode = (value: string) => new TextEncoder().encode(value);

test("accepts a large first packet when headers are small", () => {
  const body = "a".repeat(16 * 1024);
  const rawRequest = [
    "POST / HTTP/1.1",
    "Host: demo.instances.example.com",
    `Content-Length: ${body.length}`,
    "",
    body,
  ].join("\r\n");

  const buffer = new HttpRequestBuffer();
  buffer.append(encode(rawRequest));

  expect(buffer.hasError()).toBe(false);
  expect(buffer.isComplete()).toBe(true);
});

test("waits for the full body when content-length is provided", () => {
  const headers = [
    "POST / HTTP/1.1",
    "Host: demo.instances.example.com",
    "Content-Length: 12",
    "",
    "",
  ].join("\r\n");

  const buffer = new HttpRequestBuffer();
  buffer.append(encode(headers));

  expect(buffer.hasError()).toBe(false);
  expect(buffer.isComplete()).toBe(false);

  buffer.append(encode("hello world!"));

  expect(buffer.hasError()).toBe(false);
  expect(buffer.isComplete()).toBe(true);
});

test("treats a request without content-length as complete after headers", () => {
  const rawRequest = [
    "GET / HTTP/1.1",
    "Host: demo.instances.example.com",
    "",
    "",
  ].join("\r\n");

  const buffer = new HttpRequestBuffer();
  buffer.append(encode(rawRequest));

  expect(buffer.hasError()).toBe(false);
  expect(buffer.isComplete()).toBe(true);
});

test("rejects headers larger than the configured limit", () => {
  const oversizedHeaders = `GET / HTTP/1.1\r\nX-Test: ${"a".repeat(8 * 1024)}`;

  const buffer = new HttpRequestBuffer();
  buffer.append(encode(oversizedHeaders));

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe("Headers too large");
});

test("rejects negative content-length values", () => {
  const rawRequest = [
    "POST / HTTP/1.1",
    "Host: demo.instances.example.com",
    "Content-Length: -1",
    "",
    "",
  ].join("\r\n");

  const buffer = new HttpRequestBuffer();
  buffer.append(encode(rawRequest));

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe("Invalid Content-Length");
});

test("rejects bodies larger than the configured limit", () => {
  const rawRequest = [
    "POST / HTTP/1.1",
    "Host: demo.instances.example.com",
    `Content-Length: ${32 * 1024 * 1024 + 1}`,
    "",
    "",
  ].join("\r\n");

  const buffer = new HttpRequestBuffer();
  buffer.append(encode(rawRequest));

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe("Body too large");
});

test("rejects requests larger than headers and body limits combined", () => {
  const buffer = new HttpRequestBuffer();
  buffer.append(new Uint8Array(8 * 1024 + 32 * 1024 * 1024 + 1));

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe("Request too large");
});

test("keeps the request prefix when the total request size exceeds the limit", () => {
  const prefix = encode(
    ["POST / HTTP/1.1", "Host: demo.instances.example.com", "", ""].join(
      "\r\n",
    ),
  );
  const rawRequest = new Uint8Array(8 * 1024 + 32 * 1024 * 1024 + 1);
  rawRequest.set(prefix, 0);

  const buffer = new HttpRequestBuffer();
  buffer.append(rawRequest);

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe("Request too large");
  expect(buffer.getRaw()).toContain("Host: demo.instances.example.com");
});
