import { describe, expect, test } from "vitest";
import type { MailMessage } from "shared";
import {
  MAX_ATTACHMENT_BYTES,
  addAttachments,
  correspondentLabel,
  emailDocument,
  emptyDraft,
  formatExpiry,
  formatMailTime,
  hasRemoteContent,
  linkifyText,
  parseRecipients,
  replyDraft,
} from "./mail";

const message: MailMessage = {
  id: "m1",
  mailboxId: "mbx",
  direction: "inbound",
  timestamp: new Date("2026-03-04T10:15:00").getTime(),
  read: false,
  from: { name: "Target App", address: "noreply@target.example" },
  to: ["inbox@mbx.instances.example.com"],
  subject: "Verify your email",
  preview: "Hi",
  attachmentCount: 0,
  sizeBytes: 100,
  cc: [],
  replyTo: [],
  text: "Hi\nClick below",
  attachments: [],
  headers: [],
  envelope: { mailFrom: "bounce@target.example", rcptTo: [] },
};

describe("mail helpers", () => {
  test("labels the other side of a conversation", () => {
    expect(correspondentLabel(message)).toBe("Target App");
    expect(
      correspondentLabel({ ...message, from: { name: " ", address: "a@b.c" } }),
    ).toBe("a@b.c");
    expect(
      correspondentLabel({
        ...message,
        direction: "outbound",
        to: ["x@y.z", "q@w.e"],
      }),
    ).toBe("x@y.z, q@w.e");
  });

  test("formats times relative to now", () => {
    const now = new Date("2026-03-04T18:00:00").getTime();
    expect(formatMailTime(message.timestamp, now)).toBe("10:15");
    expect(formatMailTime(new Date("2026-01-02T08:00:00").getTime(), now)).toBe(
      "Jan 2",
    );
    expect(formatMailTime(new Date("2025-12-31T08:00:00").getTime(), now)).toBe(
      "Dec 31, 2025",
    );
  });

  test("formats expiry", () => {
    expect(formatExpiry(undefined, 0)).toBeUndefined();
    expect(formatExpiry(5 * 3_600_000, 0)).toBe("Expires in 5h");
    expect(formatExpiry(72 * 3_600_000, 0)).toBe("Expires in 3d");
  });

  test("splits recipient lists", () => {
    expect(parseRecipients(" a@b.c, d@e.f;g@h.i\n")).toEqual([
      "a@b.c",
      "d@e.f",
      "g@h.i",
    ]);
  });

  test("caps attachments by count and total size", () => {
    const half = { size: MAX_ATTACHMENT_BYTES / 2 };
    expect(addAttachments([half], [half, { size: 1 }])).toEqual({
      files: [half, half],
      skipped: 1,
    });
    const tiny = Array.from({ length: 12 }, () => ({ size: 1 }));
    expect(addAttachments([], tiny).files).toHaveLength(10);
  });

  test("an empty draft clears reply threading", () => {
    expect(Object.assign(replyDraft(message), emptyDraft()).inReplyTo).toBe(
      undefined,
    );
  });

  test("builds a quoted reply", () => {
    const draft = replyDraft({
      ...message,
      replyTo: [{ name: "", address: "support@target.example" }],
    });
    expect(draft).toMatchObject({
      to: "support@target.example",
      subject: "Re: Verify your email",
      inReplyTo: "m1",
    });
    expect(draft.body).toContain("> Hi\n> Click below");
    expect(replyDraft({ ...message, subject: "RE: x" }).subject).toBe("RE: x");
  });

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

  test("turns URLs in text into links", () => {
    expect(linkifyText("Open https://a.example/v?t=1. Thanks")).toEqual([
      { text: "Open " },
      { text: "https://a.example/v?t=1", href: "https://a.example/v?t=1" },
      { text: ". Thanks" },
    ]);
  });
});
