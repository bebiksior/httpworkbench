import type { UserNotice } from "shared";
import { UserNoticeSchema } from "shared";
import { db } from "../db";

export async function getPendingNoticesForUser(
  userId: string,
): Promise<UserNotice[]> {
  return db.data.userNotices.filter(
    (n) => n.userId === userId && n.acknowledgedAt === undefined,
  );
}

export async function acknowledgeUserNotice(
  noticeId: string,
  userId: string,
): Promise<UserNotice | undefined> {
  const index = db.data.userNotices.findIndex(
    (n) => n.id === noticeId && n.userId === userId,
  );
  if (index === -1) {
    return undefined;
  }
  const current = db.data.userNotices[index];
  if (current === undefined) {
    return undefined;
  }
  const updated: UserNotice = {
    ...current,
    acknowledgedAt: Date.now(),
  };
  UserNoticeSchema.parse(updated);
  db.data.userNotices[index] = updated;
  await db.write();
  return updated;
}
