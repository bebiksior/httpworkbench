import { describe, expect, test } from "bun:test";
import { composeMessage, encodeHeaderValue } from "./compose";
import {
  buildPreview,
  htmlToText,
  extractLinks,
  inlineImages,
  parseEmail,
  summarizeEmail,
} from "./parse";

describe("encodeHeaderValue", () => {
  test("keeps ASCII and strips line breaks", () => {
    expect(encodeHeaderValue("Hello\r\nBcc: x@y.z")).toBe("Hello Bcc: x@y.z");
  });

  test("encodes non-ASCII as UTF-8 encoded words", () => {
    expect(encodeHeaderValue("Zażółć")).toMatch(/^=\?UTF-8\?B\?/);
  });
});

describe("composeMessage", () => {
  test("round-trips through the parser", async () => {
    const raw = composeMessage({
      from: "inbox@abc.instances.example.com",
      to: ["a@example.org", "b@example.org"],
      subject: "Password reset — ✓",
      text: "Visit https://example.org/reset?token=1\n.line",
      html: '<p>Visit <a href="https://example.org/reset?token=1&amp;x=2">here</a></p>',
      messageId: "<id@abc.instances.example.com>",
      date: new Date("2026-01-01T00:00:00Z"),
      inReplyTo: "<orig@example.org>\r\nBcc: evil@x.y",
    });

    const email = await parseEmail(raw);
    expect(email.subject).toBe("Password reset — ✓");
    expect(email.text).toBe("Visit https://example.org/reset?token=1\n.line");
    expect(email.html).toContain("<a href=");
    expect(email.inReplyTo).toBe("<orig@example.org> Bcc: evil@x.y");
    expect(email.headers.some(({ key }) => key === "bcc")).toBe(false);
    expect(summarizeEmail(email)).toMatchObject({
      from: { address: "inbox@abc.instances.example.com" },
      to: ["a@example.org", "b@example.org"],
      attachmentCount: 0,
    });
    expect(extractLinks(email)).toEqual([
      "https://example.org/reset?token=1",
      "https://example.org/reset?token=1&x=2",
    ]);
  });
});

describe("inlineImages", () => {
  test("replaces cid references with data URLs", async () => {
    const email = await parseEmail(
      [
        'Content-Type: multipart/related; boundary="b"',
        "",
        "--b",
        "Content-Type: text/html",
        "",
        '<img src="cid:logo@x"><img src="cid:missing%zz">',
        "--b",
        "Content-Type: image/png",
        "Content-ID: <logo@x>",
        "Content-Transfer-Encoding: base64",
        "",
        "iVBORw0K",
        "--b--",
        "",
      ].join("\r\n"),
    );

    expect(inlineImages(email)).toBe(
      '<img src="data:image/png;base64,iVBORw0K"><img src="cid:missing%zz">',
    );
  });
});

describe("inlineImages limits", () => {
  test("encodes repeated references once and caps the total size", async () => {
    const image = Buffer.alloc(1024 * 1024).toString("base64");
    const email = await parseEmail(
      [
        'Content-Type: multipart/related; boundary="b"',
        "",
        "--b",
        "Content-Type: text/html",
        "",
        '<img src="cid:a">'.repeat(20),
        "--b",
        "Content-Type: image/png",
        "Content-ID: <a>",
        "Content-Transfer-Encoding: base64",
        "",
        image,
        "--b--",
        "",
      ].join("\r\n"),
    );

    const html = inlineImages(email) ?? "";
    expect(html.length).toBeLessThan(6 * 1024 * 1024);
    expect(html).toContain('src="cid:a"');
  });
});

describe("htmlToText", () => {
  test("keeps paragraph breaks", () => {
    expect(htmlToText("<p>One</p><p>Two<br>Three &amp; four</p>")).toBe(
      "One\nTwo\nThree & four",
    );
  });
});

describe("buildPreview", () => {
  test("falls back to stripped HTML", () => {
    expect(
      buildPreview({ html: "<style>p{}</style><p>Hi&nbsp;<b>there</b></p>" }),
    ).toBe("Hi there");
  });
});
