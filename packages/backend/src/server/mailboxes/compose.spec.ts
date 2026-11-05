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

describe("composeMessage attachments", () => {
  test("round-trips filenames and content", async () => {
    const raw = composeMessage({
      from: "inbox@abc.instances.example.com",
      to: ["a@example.org"],
      subject: "Files",
      text: "See attached",
      html: "<p>See attached</p>",
      attachments: [
        {
          filename: 'a "b"\\c.txt',
          contentType: "text/plain",
          content: Buffer.from("hello").toString("base64"),
        },
        {
          filename: "zażółć (1)'.bin\r\nX-Injected: 1",
          content: Buffer.alloc(200, 1).toString("base64"),
        },
      ],
      messageId: "<id@abc.instances.example.com>",
      date: new Date("2026-01-01T00:00:00Z"),
    });

    const email = await parseEmail(raw);
    expect(email.text).toBe("See attached");
    expect(email.html).toBe("<p>See attached</p>");
    expect(email.headers.some(({ key }) => key === "x-injected")).toBe(false);
    expect(
      email.attachments.map(({ filename, mimeType, content }) => ({
        filename,
        mimeType,
        size: (content as ArrayBuffer).byteLength,
      })),
    ).toEqual([
      { filename: 'a "b"\\c.txt', mimeType: "text/plain", size: 5 },
      {
        filename: "zażółć (1)'.bin X-Injected: 1",
        mimeType: "application/octet-stream",
        size: 200,
      },
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
