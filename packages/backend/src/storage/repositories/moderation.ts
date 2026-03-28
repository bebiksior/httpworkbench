import {
  GUEST_OWNER_ID,
  type InstanceModeration,
  UserNoticeSchema,
} from "shared";
import { InstanceModerationSchema } from "shared";
import { eq } from "drizzle-orm";
import { abusePolicy } from "../../config/abuse";
import { getDb } from "../db";
import {
  toDomainModeration,
  toModerationRow,
  toUserNoticeRow,
} from "../records";
import { instanceModerations, instances, userNotices } from "../schema";

const pruneStrikeTimestamps = (timestamps: number[], now: number) => {
  const cutoff = now - abusePolicy.strikeTimestampsMaxAgeMs;
  return timestamps.filter((t) => t >= cutoff);
};

const defaultModeration = (
  instanceId: string,
  now: number,
): InstanceModeration => ({
  instanceId,
  window5mStartMs: now,
  requestsInWindow5m: 0,
  strikeCommittedForWindow: false,
  strikeTimestampsMs: [],
  window15mStartMs: now,
  requestsInWindow15m: 0,
  lastMinuteBucketStartMs: now,
  requestsInCurrentMinute: 0,
});

const getModerationByInstanceId = (
  store: Pick<ReturnType<typeof getDb>, "select">,
  instanceId: string,
): InstanceModeration | undefined => {
  const row = store
    .select()
    .from(instanceModerations)
    .where(eq(instanceModerations.instanceId, instanceId))
    .get();

  if (row === undefined) {
    return undefined;
  }

  return toDomainModeration(row);
};

const getActiveInstanceState = (
  store: Pick<ReturnType<typeof getDb>, "select">,
  instanceId: string,
  now: number,
) => {
  const row = store
    .select({
      ownerId: instances.ownerId,
      expiresAt: instances.expiresAt,
    })
    .from(instances)
    .where(eq(instances.id, instanceId))
    .get();

  if (row === undefined) {
    return undefined;
  }

  if (row.expiresAt !== null && row.expiresAt <= now) {
    return undefined;
  }

  return row;
};

type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export const recordRequestAndMaybeTombstoneInTransaction = (
  tx: DbTransaction,
  instanceId: string,
  now: number,
): { tombstoned: boolean } => {
  const instance = getActiveInstanceState(tx, instanceId, now);
  if (instance === undefined) {
    tx.delete(instanceModerations)
      .where(eq(instanceModerations.instanceId, instanceId))
      .run();
    return { tombstoned: false };
  }

  let moderation =
    getModerationByInstanceId(tx, instanceId) ??
    defaultModeration(instanceId, now);

  if (now >= moderation.lastMinuteBucketStartMs + abusePolicy.minuteBucketMs) {
    moderation = {
      ...moderation,
      lastMinuteBucketStartMs: now,
      requestsInCurrentMinute: 0,
    };
  }

  if (now >= moderation.window5mStartMs + abusePolicy.window5mMs) {
    moderation = {
      ...moderation,
      window5mStartMs: now,
      requestsInWindow5m: 0,
      strikeCommittedForWindow: false,
    };
  }

  if (now >= moderation.window15mStartMs + abusePolicy.window15mMs) {
    moderation = {
      ...moderation,
      window15mStartMs: now,
      requestsInWindow15m: 0,
    };
  }

  moderation = {
    ...moderation,
    requestsInCurrentMinute: moderation.requestsInCurrentMinute + 1,
    requestsInWindow5m: moderation.requestsInWindow5m + 1,
    requestsInWindow15m: moderation.requestsInWindow15m + 1,
  };

  if (
    moderation.requestsInCurrentMinute >=
    abusePolicy.discordMuteThresholdPerMinute
  ) {
    moderation = {
      ...moderation,
      discordMutedUntilMs: now + abusePolicy.discordMuteDurationMs,
    };
  }

  if (
    moderation.discordMutedUntilMs !== undefined &&
    now >= moderation.discordMutedUntilMs
  ) {
    const { discordMutedUntilMs: _, ...rest } = moderation;
    moderation = rest;
  }

  let shouldTombstone = false;
  if (
    moderation.requestsInWindow5m >= abusePolicy.immediateTombstoneRequests5m
  ) {
    shouldTombstone = true;
  }
  if (
    moderation.requestsInWindow15m >= abusePolicy.immediateTombstoneRequests15m
  ) {
    shouldTombstone = true;
  }

  if (
    moderation.requestsInWindow5m >= abusePolicy.strikeRequestThreshold5m &&
    !moderation.strikeCommittedForWindow
  ) {
    moderation = {
      ...moderation,
      strikeCommittedForWindow: true,
      strikeTimestampsMs: pruneStrikeTimestamps(
        [...moderation.strikeTimestampsMs, now],
        now,
      ),
    };
  }

  const strikes = pruneStrikeTimestamps(moderation.strikeTimestampsMs, now);
  moderation = { ...moderation, strikeTimestampsMs: strikes };
  if (strikes.length >= abusePolicy.strikesForTombstone) {
    shouldTombstone = true;
  }

  if (shouldTombstone) {
    if (instance.ownerId !== GUEST_OWNER_ID) {
      const notice = UserNoticeSchema.parse({
        id: crypto.randomUUID(),
        userId: instance.ownerId,
        kind: "instance_removed_noise",
        instanceId,
        createdAt: now,
      });
      tx.insert(userNotices).values(toUserNoticeRow(notice)).run();
    }

    tx.delete(instances).where(eq(instances.id, instanceId)).run();
    return { tombstoned: true };
  }

  const moderationRow = toModerationRow(
    InstanceModerationSchema.parse(moderation),
  );
  tx.insert(instanceModerations)
    .values(moderationRow)
    .onConflictDoUpdate({
      target: instanceModerations.instanceId,
      set: {
        window5mStartMs: moderationRow.window5mStartMs,
        requestsInWindow5m: moderationRow.requestsInWindow5m,
        strikeCommittedForWindow: moderationRow.strikeCommittedForWindow,
        strikeTimestampsJson: moderationRow.strikeTimestampsJson,
        discordMutedUntilMs: moderationRow.discordMutedUntilMs,
        window15mStartMs: moderationRow.window15mStartMs,
        requestsInWindow15m: moderationRow.requestsInWindow15m,
        lastMinuteBucketStartMs: moderationRow.lastMinuteBucketStartMs,
        requestsInCurrentMinute: moderationRow.requestsInCurrentMinute,
      },
    })
    .run();
  return { tombstoned: false };
};

export function isDiscordMutedForInstance(
  instanceId: string,
  now: number,
): boolean {
  const moderation = getModerationByInstanceId(getDb(), instanceId);
  if (moderation?.discordMutedUntilMs === undefined) {
    return false;
  }
  return now < moderation.discordMutedUntilMs;
}
