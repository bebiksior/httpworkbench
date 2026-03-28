import {
  GUEST_OWNER_ID,
  type InstanceModeration,
  UserNoticeSchema,
} from "shared";
import { InstanceModerationSchema } from "shared";
import { abusePolicy } from "../../config/abuse";
import { db, scheduleDbWrite } from "../db";
import { getInstanceByIdSync } from "./instances";

const pruneStrikeTimestamps = (timestamps: number[], now: number) => {
  const cutoff = now - abusePolicy.strikeTimestampsMaxAgeMs;
  return timestamps.filter((t) => t >= cutoff);
};

const findModerationIndex = (instanceId: string) =>
  db.data.instanceModerations.findIndex((m) => m.instanceId === instanceId);

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

export function recordRequestAndMaybeTombstone(
  instanceId: string,
  now: number,
): { tombstoned: boolean } {
  const index = findModerationIndex(instanceId);
  const instance = getInstanceByIdSync(instanceId);
  if (instance === undefined) {
    if (index !== -1) {
      db.data.instanceModerations.splice(index, 1);
      scheduleDbWrite();
    }
    return { tombstoned: false };
  }

  let moderation: InstanceModeration =
    index === -1
      ? defaultModeration(instanceId, now)
      : (() => {
          const existing = db.data.instanceModerations[index];
          if (existing === undefined) {
            return defaultModeration(instanceId, now);
          }
          return existing;
        })();

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
    const ownerId = instance.ownerId;
    db.data.logs = db.data.logs.filter((l) => l.instanceId !== instanceId);
    const instIdx = db.data.instances.findIndex((i) => i.id === instanceId);
    if (instIdx !== -1) {
      db.data.instances.splice(instIdx, 1);
    }
    db.data.instanceModerations = db.data.instanceModerations.filter(
      (m) => m.instanceId !== instanceId,
    );
    if (ownerId !== GUEST_OWNER_ID) {
      const notice = {
        id: crypto.randomUUID(),
        userId: ownerId,
        kind: "instance_removed_noise" as const,
        instanceId,
        createdAt: now,
      };
      UserNoticeSchema.parse(notice);
      db.data.userNotices.push(notice);
    }
    scheduleDbWrite(0);
    return { tombstoned: true };
  }

  InstanceModerationSchema.parse(moderation);
  if (index === -1) {
    db.data.instanceModerations.push(moderation);
  } else {
    db.data.instanceModerations[index] = moderation;
  }
  scheduleDbWrite();
  return { tombstoned: false };
}

export function isDiscordMutedForInstance(
  instanceId: string,
  now: number,
): boolean {
  const moderation = db.data.instanceModerations.find(
    (m) => m.instanceId === instanceId,
  );
  if (moderation?.discordMutedUntilMs === undefined) {
    return false;
  }
  return now < moderation.discordMutedUntilMs;
}
