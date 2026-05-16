import { describe, expect, test } from "vitest";
import { getResponseBodyHighlightRanges } from "./responseBodyHighlighting";

describe("getResponseBodyHighlightRanges", () => {
  test("returns no ranges when there is no header separator", () => {
    const raw = "HTTP/1.1 200 OK\nContent-Type: application/json";

    expect(getResponseBodyHighlightRanges(raw)).toEqual([]);
  });

  test("highlights JSON bodies when Content-Type is JSON", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "",
      '{"ok":true}',
    ].join("\r\n");

    const ranges = getResponseBodyHighlightRanges(raw);
    expect(ranges.length).toBeGreaterThan(0);
    expect(
      ranges.some((range) => range.classes.includes("tok-propertyName")),
    ).toBe(true);
  });

  test("highlights body-only JSON", () => {
    const ranges = getResponseBodyHighlightRanges('{"ok":true}');

    expect(ranges.length).toBeGreaterThan(0);
    expect(
      ranges.some((range) => range.classes.includes("tok-propertyName")),
    ).toBe(true);
  });

  test("highlights HTML bodies when Content-Type changes to HTML", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/html",
      "",
      "<div>Hello</div>",
    ].join("\r\n");

    const ranges = getResponseBodyHighlightRanges(raw);
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.some((range) => range.classes.includes("tok-typeName"))).toBe(
      true,
    );
  });

  test("highlights body-only HTML", () => {
    const ranges = getResponseBodyHighlightRanges("<div>Hello</div>");

    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.some((range) => range.classes.includes("tok-typeName"))).toBe(
      true,
    );
  });

  test("keeps highlighting malformed JSON when the header declares JSON", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "",
      '{"ok": }',
    ].join("\r\n");

    expect(getResponseBodyHighlightRanges(raw).length).toBeGreaterThan(0);
  });

  test("keeps highlighting malformed HTML when the header declares HTML", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/html",
      "",
      "<div><span>Hello",
    ].join("\r\n");

    expect(getResponseBodyHighlightRanges(raw).length).toBeGreaterThan(0);
  });
});
