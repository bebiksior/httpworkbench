import type { UserNotice } from "shared";
import { UserNoticeSchema } from "shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { toDomainUserNotice } from "../records";
import { userNotices } from "../schema";

export function getPendingNoticesForUser(userId: string): UserNotice[] {
  return getDb()
    .select()
    .from(userNotices)
    .where(
      and(eq(userNotices.userId, userId), isNull(userNotices.acknowledgedAt)),
    )
    .orderBy(asc(userNotices.createdAt), asc(userNotices.id))
    .all()
    .map((row) => toDomainUserNotice(row));
}

export function acknowledgeUserNotice(
  noticeId: string,
  userId: string,
): UserNotice | undefined {
  const currentRow = getDb()
    .select()
    .from(userNotices)
    .where(and(eq(userNotices.id, noticeId), eq(userNotices.userId, userId)))
    .get();

  if (currentRow === undefined) {
    return undefined;
  }

  const current = toDomainUserNotice(currentRow);
  const updated: UserNotice = {
    ...current,
    acknowledgedAt: Date.now(),
  };
  UserNoticeSchema.parse(updated);

  getDb()
    .update(userNotices)
    .set({ acknowledgedAt: updated.acknowledgedAt ?? null })
    .where(and(eq(userNotices.id, noticeId), eq(userNotices.userId, userId)))
    .run();

  return updated;
}
