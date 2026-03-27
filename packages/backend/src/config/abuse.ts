const minuteMs = 60_000;
const fiveMinMs = 5 * minuteMs;
const fifteenMinMs = 15 * minuteMs;
const thirtyMinMs = 30 * minuteMs;

export const abusePolicy = {
  discordMuteThresholdPerMinute: 20,
  discordMuteDurationMs: 5 * minuteMs,
  strikeRequestThreshold5m: 100,
  strikesForTombstone: 3,
  strikeTimestampsMaxAgeMs: thirtyMinMs,
  immediateTombstoneRequests5m: 300,
  immediateTombstoneRequests15m: 1000,
  window5mMs: fiveMinMs,
  window15mMs: fifteenMinMs,
  minuteBucketMs: minuteMs,
} as const;
