import { describe, expect, test } from "vitest";
import {
  detectResponseBodySyntax,
  detectContentTypeFromFileName,
  extractHttpBody,
  formatStaticHttpResponse,
  getHttpHeaderValue,
  getResponseBodySyntaxFromContentType,
  sniffResponseBodySyntax,
  splitHttpResponse,
} from "./httpResponse";

describe("detectContentTypeFromFileName", () => {
  test.each([
    ["index.html", "text/html"],
    ["index.htm", "text/html"],
    ["data.json", "application/json"],
    ["feed.xml", "application/xml"],
    ["notes.txt", "text/plain"],
    ["styles.css", "text/css"],
    ["app.js", "application/javascript"],
    ["logo.svg", "image/svg+xml"],
    ["UPPER.HTML", "text/html"],
  ])("maps %s to %s", (fileName, contentType) => {
    expect(detectContentTypeFromFileName(fileName)).toBe(contentType);
  });

  test("falls back to text/plain for unknown extensions", () => {
    expect(detectContentTypeFromFileName("archive.bin")).toBe("text/plain");
  });

  test("falls back to text/plain when the file has no extension", () => {
    expect(detectContentTypeFromFileName("README")).toBe("text/plain");
  });
});

describe("formatStaticHttpResponse", () => {
  test("formats a static HTTP response with the expected headers", () => {
    expect(
      formatStaticHttpResponse({
        body: "<h1>Hello</h1>",
        contentType: "text/html",
      }),
    ).toBe(
      [
        "HTTP/1.1 200 OK",
        "Content-Type: text/html",
        "Access-Control-Allow-Origin: *",
        "Access-Control-Allow-Headers: *",
        "",
        "<h1>Hello</h1>",
      ].join("\r\n"),
    );
  });
});

describe("extractHttpBody", () => {
  test("extracts the body from LF-delimited raw HTTP", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/plain",
      "",
      "hello",
    ].join("\n");

    expect(extractHttpBody(raw)).toBe("hello");
  });

  test("extracts the body from CRLF-delimited raw HTTP", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/plain",
      "",
      "hello",
    ].join("\r\n");

    expect(extractHttpBody(raw)).toBe("hello");
  });

  test("returns an empty string for undefined input", () => {
    expect(extractHttpBody(undefined)).toBe("");
  });

  test("returns an empty string for empty input", () => {
    expect(extractHttpBody("")).toBe("");
  });
});

describe("splitHttpResponse", () => {
  test("splits LF-delimited raw HTTP responses", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/plain",
      "",
      "hello",
    ].join("\n");

    expect(splitHttpResponse(raw)).toEqual({
      headerBlock: ["HTTP/1.1 200 OK", "Content-Type: text/plain"].join("\n"),
      body: "hello",
      bodyStart: raw.indexOf("hello"),
    });
  });

  test("splits CRLF-delimited raw HTTP responses", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/plain",
      "",
      "hello",
    ].join("\r\n");

    expect(splitHttpResponse(raw)).toEqual({
      headerBlock: ["HTTP/1.1 200 OK", "Content-Type: text/plain"].join("\r\n"),
      body: "hello",
      bodyStart: raw.indexOf("hello"),
    });
  });
});

describe("getHttpHeaderValue", () => {
  test("reads headers case-insensitively from a raw response", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "",
      '{"ok":true}',
    ].join("\r\n");

    expect(getHttpHeaderValue(raw, "content-type")).toBe("application/json");
    expect(getHttpHeaderValue(raw, "Content-Type")).toBe("application/json");
  });
});

describe("getResponseBodySyntaxFromContentType", () => {
  test.each([
    ["application/json", "json"],
    ["application/problem+json", "json"],
    ["text/html", "html"],
    ["text/html; charset=utf-8", "html"],
    ["application/xhtml+xml", "html"],
    ["text/plain", undefined],
  ])("maps %s to %s", (contentType, syntax) => {
    expect(getResponseBodySyntaxFromContentType(contentType)).toBe(syntax);
  });
});

describe("sniffResponseBodySyntax", () => {
  test("detects JSON bodies", () => {
    expect(sniffResponseBodySyntax('{ "ok": true }')).toBe("json");
  });

  test("detects HTML bodies", () => {
    expect(sniffResponseBodySyntax("<html><body>Hello</body></html>")).toBe(
      "html",
    );
  });
});

describe("detectResponseBodySyntax", () => {
  test("prefers Content-Type JSON", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "",
      '{"ok":true}',
    ].join("\r\n");

    expect(detectResponseBodySyntax(raw)).toBe("json");
  });

  test("supports +json content types", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: application/problem+json",
      "",
      '{"title":"Oops"}',
    ].join("\r\n");

    expect(detectResponseBodySyntax(raw)).toBe("json");
  });

  test("prefers Content-Type HTML", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/html",
      "",
      "<h1>Hello</h1>",
    ].join("\r\n");

    expect(detectResponseBodySyntax(raw)).toBe("html");
  });

  test("supports HTML with charset parameters", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<h1>Hello</h1>",
    ].join("\r\n");

    expect(detectResponseBodySyntax(raw)).toBe("html");
  });

  test("falls back to JSON sniffing when the header is missing", () => {
    const raw = ["HTTP/1.1 200 OK", "X-Test: true", "", '{"ok":true}'].join(
      "\r\n",
    );

    expect(detectResponseBodySyntax(raw)).toBe("json");
  });

  test("falls back to HTML sniffing when the header is missing", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "X-Test: true",
      "",
      "<div>Hello</div>",
    ].join("\r\n");

    expect(detectResponseBodySyntax(raw)).toBe("html");
  });

  test("returns undefined for unknown content types and non-sniffable bodies", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/plain",
      "",
      "hello world",
    ].join("\r\n");

    expect(detectResponseBodySyntax(raw)).toBeUndefined();
  });
});
