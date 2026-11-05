import type {
  Mailbox,
  MailDirection,
  MailMessageSummary,
  MailboxSummary,
} from "shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "../db";
import { mailboxes, mailMessages } from "../schema";

type MailboxRow = typeof mailboxes.$inferSelect;
type MailMessageRow = typeof mailMessages.$inferSelect;
export type MailMessageInsert = Omit<typeof mailMessages.$inferInsert, "seq">;

export type MailboxRecord = Omit<Mailbox, "address">;
export type MailboxSummaryRecord = Omit<MailboxSummary, "address">;

export const MAX_MESSAGES_PER_MAILBOX = 500;

const activeMailboxCondition = (now: number) =>
  or(isNull(mailboxes.expiresAt), gt(mailboxes.expiresAt, now));

const toMailbox = (row: MailboxRow): MailboxRecord => ({
  id: row.id,
  ownerId: row.ownerId,
  localPart: row.localPart,
  label: row.label ?? undefined,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt ?? undefined,
});

const summaryColumns = {
  seq: mailMessages.seq,
  id: mailMessages.id,
  mailboxId: mailMessages.mailboxId,
  direction: mailMessages.direction,
  timestamp: mailMessages.timestamp,
  isRead: mailMessages.isRead,
  fromName: mailMessages.fromName,
  fromAddress: mailMessages.fromAddress,
  toJson: mailMessages.toJson,
  subject: mailMessages.subject,
  preview: mailMessages.preview,
  attachmentCount: mailMessages.attachmentCount,
  sizeBytes: mailMessages.sizeBytes,
};

type SummaryRow = Pick<MailMessageRow, keyof typeof summaryColumns>;

const toMessageSummary = (row: SummaryRow): MailMessageSummary => ({
  id: row.id,
  mailboxId: row.mailboxId,
  direction: row.direction,
  timestamp: row.timestamp,
  read: row.isRead,
  from:
    row.fromAddress === null
      ? undefined
      : { name: row.fromName ?? "", address: row.fromAddress },
  to: row.toJson,
  subject: row.subject,
  preview: row.preview,
  attachmentCount: row.attachmentCount,
  sizeBytes: row.sizeBytes,
});

export type StoredMailMessage = {
  seq: number;
  summary: MailMessageSummary;
  messageId?: string;
  envelope: { mailFrom: string; rcptTo: string[]; clientAddress?: string };
  raw: string;
};

export function addMailbox(mailbox: MailboxRecord): MailboxRecord {
  const row = getDb()
    .insert(mailboxes)
    .values({
      id: mailbox.id,
      ownerId: mailbox.ownerId,
      localPart: mailbox.localPart,
      label: mailbox.label ?? null,
      createdAt: mailbox.createdAt,
      expiresAt: mailbox.expiresAt ?? null,
    })
    .returning()
    .get();
  return toMailbox(row);
}

export function getMailboxById(id: string): MailboxRecord | undefined {
  const row = getDb()
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.id, id), activeMailboxCondition(Date.now())))
    .get();
  return row === undefined ? undefined : toMailbox(row);
}

export function hasActiveMailbox(id: string): boolean {
  return getMailboxById(id) !== undefined;
}

export function mailboxIdExists(id: string): boolean {
  return (
    getDb()
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(eq(mailboxes.id, id))
      .get() !== undefined
  );
}

export function countActiveMailboxesByOwner(ownerId: string): number {
  return (
    getDb()
      .select({ count: count() })
      .from(mailboxes)
      .where(
        and(eq(mailboxes.ownerId, ownerId), activeMailboxCondition(Date.now())),
      )
      .get()?.count ?? 0
  );
}

export function getMailboxSummariesByOwner(
  ownerId: string,
): MailboxSummaryRecord[] {
  const inbound = eq(mailMessages.direction, "inbound");
  const rows = getDb()
    .select({
      mailbox: mailboxes,
      messageCount: sql<number>`count(${mailMessages.seq})`,
      unreadCount: sql<number>`coalesce(sum(case when ${mailMessages.isRead} = 0 then 1 else 0 end), 0)`,
      lastMessageAt: max(mailMessages.timestamp),
    })
    .from(mailboxes)
    .leftJoin(
      mailMessages,
      and(eq(mailMessages.mailboxId, mailboxes.id), inbound),
    )
    .where(
      and(eq(mailboxes.ownerId, ownerId), activeMailboxCondition(Date.now())),
    )
    .groupBy(mailboxes.id)
    .orderBy(desc(mailboxes.createdAt), desc(mailboxes.id))
    .all();

  return rows.map((row) => ({
    ...toMailbox(row.mailbox),
    messageCount: row.messageCount,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt ?? undefined,
  }));
}

export function updateMailbox(
  id: string,
  patch: Partial<Pick<MailboxRecord, "localPart" | "label" | "expiresAt">>,
): MailboxRecord | undefined {
  const values = {
    ...(patch.localPart === undefined ? {} : { localPart: patch.localPart }),
    ...("label" in patch ? { label: patch.label ?? null } : {}),
    ...("expiresAt" in patch ? { expiresAt: patch.expiresAt ?? null } : {}),
  };
  if (Object.keys(values).length > 0) {
    getDb()
      .update(mailboxes)
      .set(values)
      .where(and(eq(mailboxes.id, id), activeMailboxCondition(Date.now())))
      .run();
  }
  return getMailboxById(id);
}

export function deleteMailbox(id: string): void {
  getDb().delete(mailboxes).where(eq(mailboxes.id, id)).run();
}

export function removeExpiredMailboxes(now: number): string[] {
  return getDb()
    .delete(mailboxes)
    .where(and(isNotNull(mailboxes.expiresAt), lte(mailboxes.expiresAt, now)))
    .returning({ id: mailboxes.id })
    .all()
    .map(({ id }) => id);
}

export function addMailMessage(message: MailMessageInsert): number {
  return getDb().transaction(
    (tx) => {
      const inserted = tx
        .insert(mailMessages)
        .values(message)
        .returning({ seq: mailMessages.seq })
        .get();
      const overflow = tx
        .select({ seq: mailMessages.seq })
        .from(mailMessages)
        .where(eq(mailMessages.mailboxId, message.mailboxId))
        .orderBy(desc(mailMessages.seq))
        .limit(1)
        .offset(MAX_MESSAGES_PER_MAILBOX)
        .get();
      if (overflow !== undefined) {
        tx.delete(mailMessages)
          .where(
            and(
              eq(mailMessages.mailboxId, message.mailboxId),
              lte(mailMessages.seq, overflow.seq),
            ),
          )
          .run();
      }
      return inserted.seq;
    },
    { behavior: "immediate" },
  );
}

export function listMailMessages(input: {
  mailboxId: string;
  direction?: MailDirection;
  limit: number;
  beforeSeq?: number;
}): { messages: MailMessageSummary[]; nextSeq?: number } {
  const filters = [eq(mailMessages.mailboxId, input.mailboxId)];
  if (input.direction !== undefined) {
    filters.push(eq(mailMessages.direction, input.direction));
  }
  if (input.beforeSeq !== undefined) {
    filters.push(lt(mailMessages.seq, input.beforeSeq));
  }
  const rows = getDb()
    .select(summaryColumns)
    .from(mailMessages)
    .where(and(...filters))
    .orderBy(desc(mailMessages.seq))
    .limit(input.limit + 1)
    .all();
  const page = rows.slice(0, input.limit);
  return {
    messages: page.map(toMessageSummary),
    nextSeq: rows.length > input.limit ? page.at(-1)?.seq : undefined,
  };
}

export function listMailMessagesAfter(input: {
  mailboxId: string;
  direction?: MailDirection;
  afterSeq: number;
  limit: number;
}): { messages: MailMessageSummary[]; lastSeq: number } {
  const filters = [
    eq(mailMessages.mailboxId, input.mailboxId),
    gt(mailMessages.seq, input.afterSeq),
  ];
  if (input.direction !== undefined) {
    filters.push(eq(mailMessages.direction, input.direction));
  }
  const rows = getDb()
    .select(summaryColumns)
    .from(mailMessages)
    .where(and(...filters))
    .orderBy(asc(mailMessages.seq))
    .limit(input.limit)
    .all();
  return {
    messages: rows.map(toMessageSummary),
    lastSeq: rows.at(-1)?.seq ?? input.afterSeq,
  };
}

export function latestMailMessageSeq(mailboxId: string): number {
  return (
    getDb()
      .select({ seq: max(mailMessages.seq) })
      .from(mailMessages)
      .where(eq(mailMessages.mailboxId, mailboxId))
      .get()?.seq ?? 0
  );
}

export function getMailMessage(
  mailboxId: string,
  messageId: string,
): StoredMailMessage | undefined {
  const row = getDb()
    .select()
    .from(mailMessages)
    .where(
      and(
        eq(mailMessages.mailboxId, mailboxId),
        eq(mailMessages.id, messageId),
      ),
    )
    .get();
  if (row === undefined) {
    return undefined;
  }
  return {
    seq: row.seq,
    summary: toMessageSummary(row),
    messageId: row.messageId ?? undefined,
    envelope: {
      mailFrom: row.mailFrom,
      rcptTo: row.rcptToJson,
      clientAddress: row.clientAddress ?? undefined,
    },
    raw: row.raw,
  };
}

export function setMailMessageRead(
  mailboxId: string,
  messageId: string,
  read: boolean,
): void {
  getDb()
    .update(mailMessages)
    .set({ isRead: read })
    .where(
      and(
        eq(mailMessages.mailboxId, mailboxId),
        eq(mailMessages.id, messageId),
      ),
    )
    .run();
}

export function deleteMailMessage(
  mailboxId: string,
  messageId: string,
): boolean {
  return (
    getDb()
      .delete(mailMessages)
      .where(
        and(
          eq(mailMessages.mailboxId, mailboxId),
          eq(mailMessages.id, messageId),
        ),
      )
      .returning({ id: mailMessages.id })
      .all().length > 0
  );
}

export function clearMailMessages(
  mailboxId: string,
  direction?: MailDirection,
): void {
  const filters = [eq(mailMessages.mailboxId, mailboxId)];
  if (direction !== undefined) {
    filters.push(eq(mailMessages.direction, direction));
  }
  getDb()
    .delete(mailMessages)
    .where(and(...filters))
    .run();
}
