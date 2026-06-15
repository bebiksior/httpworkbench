const minuteMs = 60_000;

export const abusePolicy = {
  discordMuteThresholdPerMinute: 20,
  discordWebhookLimitPerMinutePerInstance: 5,
  discordMuteDurationMs: 5 * minuteMs,
  strikeRequestThreshold5m: 130,
  strikesForTombstone: 3,
  strikeTimestampsMaxAgeMs: 30 * minuteMs,
  immediateTombstoneRequests5m: 350,
  immediateTombstoneRequests15m: 1000,
  window5mMs: 5 * minuteMs,
  window15mMs: 15 * minuteMs,
  minuteBucketMs: minuteMs,
} as const;
