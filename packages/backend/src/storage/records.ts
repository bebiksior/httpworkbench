import {
  InstanceModerationSchema,
  InstanceSchema,
  UserNoticeSchema,
  type Instance,
  type InstanceModeration,
  type UserNotice,
} from "shared";
import { instanceModerations, instances, userNotices } from "./schema";

type InstanceRow = typeof instances.$inferSelect;
type InstanceInsertRow = typeof instances.$inferInsert;
type ModerationRow = typeof instanceModerations.$inferSelect;
type ModerationInsertRow = typeof instanceModerations.$inferInsert;
type UserNoticeInsertRow = typeof userNotices.$inferInsert;
type UserNoticeRow = typeof userNotices.$inferSelect;

export const toDomainInstance = (
  row: InstanceRow,
  webhookIds: string[],
): Instance => {
  if (row.kind === "static") {
    return InstanceSchema.parse({
      id: row.id,
      ownerId: row.ownerId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt ?? undefined,
      label: row.label ?? undefined,
      webhookIds,
      public: row.isPublic,
      locked: row.isLocked,
      kind: "static",
      raw: row.raw ?? "",
    });
  }

  return InstanceSchema.parse({
    id: row.id,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? undefined,
    label: row.label ?? undefined,
    webhookIds,
    public: row.isPublic,
    locked: row.isLocked,
    kind: "dynamic",
    processors: row.processorsJson ?? [],
  });
};

export const toInstanceRow = (instance: Instance): InstanceInsertRow => {
  const parsed = InstanceSchema.parse(instance);
  return {
    id: parsed.id,
    ownerId: parsed.ownerId,
    createdAt: parsed.createdAt,
    expiresAt: parsed.expiresAt ?? null,
    label: parsed.label ?? null,
    isPublic: parsed.public,
    isLocked: parsed.locked,
    kind: parsed.kind,
    raw: parsed.kind === "static" ? parsed.raw : null,
    processorsJson: parsed.kind === "dynamic" ? parsed.processors : null,
  };
};

export const toDomainModeration = (row: ModerationRow): InstanceModeration => {
  return InstanceModerationSchema.parse({
    instanceId: row.instanceId,
    window5mStartMs: row.window5mStartMs,
    requestsInWindow5m: row.requestsInWindow5m,
    strikeCommittedForWindow: row.strikeCommittedForWindow,
    strikeTimestampsMs: row.strikeTimestampsJson,
    discordMutedUntilMs: row.discordMutedUntilMs ?? undefined,
    window15mStartMs: row.window15mStartMs,
    requestsInWindow15m: row.requestsInWindow15m,
    lastMinuteBucketStartMs: row.lastMinuteBucketStartMs,
    requestsInCurrentMinute: row.requestsInCurrentMinute,
  });
};

export const toModerationRow = (
  moderation: InstanceModeration,
): ModerationInsertRow => {
  const parsed = InstanceModerationSchema.parse(moderation);
  return {
    instanceId: parsed.instanceId,
    window5mStartMs: parsed.window5mStartMs,
    requestsInWindow5m: parsed.requestsInWindow5m,
    strikeCommittedForWindow: parsed.strikeCommittedForWindow,
    strikeTimestampsJson: parsed.strikeTimestampsMs,
    discordMutedUntilMs: parsed.discordMutedUntilMs ?? null,
    window15mStartMs: parsed.window15mStartMs,
    requestsInWindow15m: parsed.requestsInWindow15m,
    lastMinuteBucketStartMs: parsed.lastMinuteBucketStartMs,
    requestsInCurrentMinute: parsed.requestsInCurrentMinute,
  };
};

export const toDomainUserNotice = (row: UserNoticeRow): UserNotice => {
  return UserNoticeSchema.parse({
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    instanceId: row.instanceId,
    createdAt: row.createdAt,
    acknowledgedAt: row.acknowledgedAt ?? undefined,
  });
};

export const toUserNoticeRow = (notice: UserNotice): UserNoticeInsertRow => {
  const parsed = UserNoticeSchema.parse(notice);
  return {
    id: parsed.id,
    userId: parsed.userId,
    kind: parsed.kind,
    instanceId: parsed.instanceId,
    createdAt: parsed.createdAt,
    acknowledgedAt: parsed.acknowledgedAt ?? null,
  };
};
