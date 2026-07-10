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

test("recognizes a header delimiter split across packets", () => {
  const buffer = new HttpRequestBuffer();
  buffer.append(
    encode("GET / HTTP/1.1\r\nHost: demo.instances.example.com\r\n\r"),
  );

  expect(buffer.isComplete()).toBe(false);

  buffer.append(encode("\n"));

  expect(buffer.hasError()).toBe(false);
  expect(buffer.isComplete()).toBe(true);
});

test("preserves fragmented request bodies while growing", () => {
  const body = "a".repeat(1024 * 1024);
  const rawRequest = encode(
    `POST / HTTP/1.1\r\nHost: demo.instances.example.com\r\nContent-Length: ${body.length}\r\n\r\n${body}`,
  );
  const buffer = new HttpRequestBuffer();

  for (let offset = 0; offset < rawRequest.length; offset += 4096) {
    buffer.append(rawRequest.subarray(offset, offset + 4096));
  }

  expect(buffer.hasError()).toBe(false);
  expect(buffer.isComplete()).toBe(true);
  expect(buffer.getRaw()).toEndWith(body);
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

test("rejects non-decimal content-length values", () => {
  const buffer = new HttpRequestBuffer();
  buffer.append(
    encode(
      [
        "POST / HTTP/1.1",
        "Host: demo.instances.example.com",
        "Content-Length: 5junk",
        "",
        "hello",
      ].join("\r\n"),
    ),
  );

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe("Invalid Content-Length");
});

test("accepts matching duplicate content-length values", () => {
  const buffer = new HttpRequestBuffer();
  buffer.append(
    encode(
      [
        "POST / HTTP/1.1",
        "Host: demo.instances.example.com",
        "Content-Length: 5",
        "Content-Length: 5",
        "",
        "hello",
      ].join("\r\n"),
    ),
  );

  expect(buffer.hasError()).toBe(false);
  expect(buffer.isComplete()).toBe(true);
});

test("rejects conflicting duplicate content-length values", () => {
  const buffer = new HttpRequestBuffer();
  buffer.append(
    encode(
      [
        "POST / HTTP/1.1",
        "Host: demo.instances.example.com",
        "Content-Length: 5",
        "Content-Length: 10",
        "",
        "hello",
      ].join("\r\n"),
    ),
  );

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe("Conflicting Content-Length headers");
});

test("rejects transfer-encoded requests", () => {
  const buffer = new HttpRequestBuffer();
  buffer.append(
    encode(
      [
        "POST / HTTP/1.1",
        "Host: demo.instances.example.com",
        "Transfer-Encoding: chunked",
        "",
        "",
      ].join("\r\n"),
    ),
  );

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe("Transfer-Encoding is not supported");
});

test("rejects requests with transfer-encoding and content-length", () => {
  const buffer = new HttpRequestBuffer();
  buffer.append(
    encode(
      [
        "POST / HTTP/1.1",
        "Host: demo.instances.example.com",
        "Transfer-Encoding: chunked",
        "Content-Length: 5",
        "",
        "",
      ].join("\r\n"),
    ),
  );

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe(
    "Conflicting Transfer-Encoding and Content-Length",
  );
});

test("rejects whitespace before a header colon", () => {
  const buffer = new HttpRequestBuffer();
  buffer.append(
    encode(
      [
        "POST / HTTP/1.1",
        "Host: demo.instances.example.com",
        "Content-Length : 5",
        "",
        "hello",
      ].join("\r\n"),
    ),
  );

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe("Invalid header name");
});

test("rejects obsolete folded headers", () => {
  const buffer = new HttpRequestBuffer();
  buffer.append(
    encode(
      [
        "POST / HTTP/1.1",
        "Host: demo.instances.example.com",
        "Content-Length: 5",
        " 5",
        "",
        "hello",
      ].join("\r\n"),
    ),
  );

  expect(buffer.hasError()).toBe(true);
  expect(buffer.getError()).toBe("Obsolete folded headers are not supported");
});

test("returns only the framed request when extra bytes follow", () => {
  const buffer = new HttpRequestBuffer();
  const firstRequest = [
    "POST / HTTP/1.1",
    "Host: demo.instances.example.com",
    "Content-Length: 5",
    "",
    "hello",
  ].join("\r\n");
  buffer.append(
    encode(`${firstRequest}GET /smuggled HTTP/1.1\r\nHost: other\r\n\r\n`),
  );

  expect(buffer.hasError()).toBe(false);
  expect(buffer.isComplete()).toBe(true);
  expect(buffer.getRaw()).toBe(firstRequest);
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
