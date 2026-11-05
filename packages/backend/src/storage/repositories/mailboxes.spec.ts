import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDb, initDb } from "../db";
import {
  addMailbox,
  addMailMessage,
  getMailboxSummariesByOwner,
  hasActiveMailbox,
  listMailMessages,
  listMailMessagesAfter,
  MAX_MESSAGES_PER_MAILBOX,
  removeExpiredMailboxes,
  setMailMessageRead,
  type MailMessageInsert,
} from "./mailboxes";

let dataDir = "";

const message = (
  overrides: Partial<MailMessageInsert> = {},
): MailMessageInsert => ({
  id: crypto.randomUUID(),
  mailboxId: "mbx00001",
  direction: "inbound",
  timestamp: 1,
  isRead: false,
  fromName: "Sender",
  fromAddress: "sender@example.org",
  toJson: ["inbox@mbx00001.instances.localhost"],
  subject: "Hello",
  preview: "Hi",
  attachmentCount: 0,
  sizeBytes: 10,
  messageId: null,
  mailFrom: "sender@example.org",
  rcptToJson: ["inbox@mbx00001.instances.localhost"],
  clientAddress: "1.2.3.4",
  raw: "Subject: Hello\r\n\r\nHi\r\n",
  ...overrides,
});

describe("mailbox repository", () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "httpworkbench-mailboxes-"));
    initDb({ dataDir, reset: true });
    addMailbox({
      id: "mbx00001",
      ownerId: "user-1",
      localPart: "inbox",
      createdAt: 1,
    });
  });

  afterEach(() => {
    closeDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("counts unread inbox messages in summaries", () => {
    const first = message();
    addMailMessage(first);
    addMailMessage(message());
    addMailMessage(message({ direction: "outbound", isRead: true }));
    setMailMessageRead("mbx00001", first.id, true);

    expect(getMailboxSummariesByOwner("user-1")).toMatchObject([
      {
        id: "mbx00001",
        messageCount: 2,
        unreadCount: 1,
      },
    ]);
  });

  test("pages messages newest first per folder", () => {
    const ids = [0, 1, 2].map((index) => {
      const entry = message({ timestamp: index });
      addMailMessage(entry);
      return entry.id;
    });
    addMailMessage(message({ direction: "outbound" }));

    const first = listMailMessages({
      mailboxId: "mbx00001",
      direction: "inbound",
      limit: 2,
    });
    expect(first.messages.map(({ id }) => id)).toEqual(ids.slice(1).reverse());
    const second = listMailMessages({
      mailboxId: "mbx00001",
      direction: "inbound",
      limit: 2,
      beforeSeq: first.nextSeq,
    });
    expect(second.messages.map(({ id }) => id)).toEqual(ids.slice(0, 1));
    expect(second.nextSeq).toBeUndefined();
  });

  test("returns only messages after a cursor", () => {
    const seq = addMailMessage(message());
    const later = message();
    addMailMessage(later);

    const page = listMailMessagesAfter({
      mailboxId: "mbx00001",
      afterSeq: seq,
      limit: 10,
    });
    expect(page.messages.map(({ id }) => id)).toEqual([later.id]);
    expect(page.lastSeq).toBeGreaterThan(seq);
  });

  test("keeps only the newest messages per mailbox", () => {
    for (let index = 0; index < MAX_MESSAGES_PER_MAILBOX + 3; index += 1) {
      addMailMessage(message({ subject: `#${index}` }));
    }

    const page = listMailMessages({ mailboxId: "mbx00001", limit: 1000 });
    expect(page.messages).toHaveLength(MAX_MESSAGES_PER_MAILBOX);
    expect(page.messages.at(-1)?.subject).toBe("#3");
  });

  test("removes expired mailboxes with their messages", () => {
    addMailbox({
      id: "mbx00002",
      ownerId: "user-1",
      localPart: "x",
      createdAt: 1,
      expiresAt: 5,
    });
    addMailMessage(message({ mailboxId: "mbx00002" }));

    expect(removeExpiredMailboxes(10)).toEqual(["mbx00002"]);
    expect(hasActiveMailbox("mbx00002")).toBe(false);
    expect(
      listMailMessages({ mailboxId: "mbx00002", limit: 10 }).messages,
    ).toEqual([]);
  });
});
