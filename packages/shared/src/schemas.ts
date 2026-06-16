import { z } from "zod";

export const UserRecordSchema = z.object({
  id: z.string(),
  googleId: z.string(),
  createdAt: z.number(),
});

export type UserRecord = z.infer<typeof UserRecordSchema>;

export const UserSchema = z.object({
  id: z.string(),
  googleId: z.string(),
  createdAt: z.number(),
});

export type User = z.infer<typeof UserSchema>;

export const ProcessorSchema = z.object({
  name: z.string(),
  code: z.string(),
});

export type Processor = z.infer<typeof ProcessorSchema>;

const InstanceBaseSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  createdAt: z.number(),
  expiresAt: z.number().optional(),
  webhookIds: z.array(z.string()),
  label: z.string().optional(),
  public: z.boolean().optional().default(false),
  locked: z.boolean().optional().default(false),
});

export const InstanceSchema = z.union([
  InstanceBaseSchema.extend({
    kind: z.literal("static"),
    raw: z.string(),
  }),
  InstanceBaseSchema.extend({
    kind: z.literal("dynamic"),
    processors: z.array(ProcessorSchema),
  }),
]);

export type Instance = z.infer<typeof InstanceSchema>;
export type InstanceKind = Instance["kind"];

export const LogSchema = z.object({
  id: z.string(),
  instanceId: z.string(),
  type: z.union([z.literal("dns"), z.literal("http"), z.literal("smtp")]),
  timestamp: z.number(),
  address: z.string(),
  addressVerified: z.boolean().optional(),
  raw: z.string(),
});

export type Log = z.infer<typeof LogSchema>;
export type LogType = Log["type"];

export const WebhookMessageSchema = z.string().max(2000).optional();

export const WebhookSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  message: WebhookMessageSchema,
  ownerId: z.string(),
  createdAt: z.number(),
});

export type Webhook = z.infer<typeof WebhookSchema>;

export const ApiKeyScopeSchema = z.union([
  z.literal("instances:read"),
  z.literal("instances:write"),
  z.literal("instances:delete"),
  z.literal("logs:read"),
  z.literal("logs:stream"),
]);

export type ApiKeyScope = z.infer<typeof ApiKeyScopeSchema>;

export const ApiKeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(ApiKeyScopeSchema),
  createdAt: z.number(),
  lastUsedAt: z.number().optional(),
  expiresAt: z.number().optional(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const InstanceModerationSchema = z.object({
  instanceId: z.string(),
  window5mStartMs: z.number(),
  requestsInWindow5m: z.number(),
  strikeCommittedForWindow: z.boolean(),
  strikeTimestampsMs: z.array(z.number()),
  discordMutedUntilMs: z.number().optional(),
  window15mStartMs: z.number(),
  requestsInWindow15m: z.number(),
  lastMinuteBucketStartMs: z.number(),
  requestsInCurrentMinute: z.number(),
});

export type InstanceModeration = z.infer<typeof InstanceModerationSchema>;

export const UserNoticeKindSchema = z.literal("instance_removed_noise");

export const UserNoticeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  kind: UserNoticeKindSchema,
  instanceId: z.string(),
  createdAt: z.number(),
  acknowledgedAt: z.number().optional(),
});

export type UserNotice = z.infer<typeof UserNoticeSchema>;
export type UserNoticeKind = UserNotice["kind"];

export const ConfigSchema = z.object({
  isHosted: z.boolean(),
  allowGuest: z.boolean(),
  defaultTtlMs: z.number().optional(),
  maxTtlMs: z.number().optional(),
  maxInstancesPerOwner: z.number().optional(),
  rawLimitBytes: z.number(),
  dnsEnabled: z.boolean(),
  smtpEnabled: z.boolean(),
  instancesDomain: z.string(),
});

export type Config = z.infer<typeof ConfigSchema>;
