import { describe, expect, test } from "vitest";
import { emailDocument, hasRemoteContent } from "./emailDocument";

describe("emailDocument", () => {
  test("detects remote content and blocks it by default", () => {
    expect(hasRemoteContent('<img src="https://t.example/p.png">')).toBe(true);
    expect(
      hasRemoteContent("<div style=\"background:url('//t.example/a')\">"),
    ).toBe(true);
    expect(hasRemoteContent('<img src="data:image/png;base64,AA">')).toBe(
      false,
    );
    const document = emailDocument(
      { head: "<style></style>", body: "x" },
      false,
    );
    expect(document).toContain("img-src data:;");
    expect(document).toContain("form-action 'none'");
    expect(document).toContain("<style></style></head><body>x</body>");
    expect(emailDocument({ head: "", body: "" }, true)).toContain(
      "img-src data: https: http:",
    );
  });
});
