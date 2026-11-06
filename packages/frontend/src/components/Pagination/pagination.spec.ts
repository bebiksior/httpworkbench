import { describe, expect, test } from "vitest";
import { clampPage, pageItems, parsePage } from "./pagination";

describe("parsePage", () => {
  test("accepts positive integers and falls back to 1", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(["2"])).toBe(1);
  });
});

describe("clampPage", () => {
  test("keeps the page within 1..pageCount", () => {
    expect(clampPage(5, 3)).toBe(3);
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(4, 0)).toBe(1);
  });
});

describe("pageItems", () => {
  test("lists every page when there are few", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("collapses distant pages into gaps", () => {
    expect(pageItems(1, 32)).toEqual([1, 2, 3, 4, "gap", 32]);
    expect(pageItems(16, 32)).toEqual([1, "gap", 15, 16, 17, "gap", 32]);
    expect(pageItems(32, 32)).toEqual([1, "gap", 29, 30, 31, 32]);
  });

  test("shows a lone hidden page instead of a gap", () => {
    expect(pageItems(4, 32)).toEqual([1, 2, 3, 4, 5, "gap", 32]);
  });
});
