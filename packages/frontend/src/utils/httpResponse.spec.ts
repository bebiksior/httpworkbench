import { describe, expect, test } from "vitest";
import {
  detectContentTypeFromFileName,
  extractHttpBody,
  formatStaticHttpResponse,
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
      ].join("\n"),
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
