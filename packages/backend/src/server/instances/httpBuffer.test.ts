import { expect, test } from "bun:test";
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
