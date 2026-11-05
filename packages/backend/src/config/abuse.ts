import { parseBooleanEnv } from "shared";

const minuteMs = 60_000;

export const instanceRemoval = {
  enabled: parseBooleanEnv(Bun.env.REMOVE_NOISY_INSTANCES) ?? false,
};

export const abusePolicy = {
  discordMuteThresholdPerMinute: 20,
  discordWebhookDebounceMs: 3_000,
  discordWebhookLimitPerMinutePerInstance: 5,
  discordMuteDurationMs: 5 * minuteMs,
  // Sized so a fuzzing run or blind-injection sweep pointed at one instance stays well below.
  strikeRequestThreshold5m: 1_500,
  strikesForTombstone: 3,
  strikeTimestampsMaxAgeMs: 30 * minuteMs,
  immediateTombstoneRequests5m: 5_000,
  immediateTombstoneRequests15m: 12_000,
  window5mMs: 5 * minuteMs,
  window15mMs: 15 * minuteMs,
  minuteBucketMs: minuteMs,
} as const;
