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

export const LogSchema = z.object({
  id: z.string(),
  instanceId: z.string(),
  type: z.union([z.literal("dns"), z.literal("http")]),
  timestamp: z.number(),
  address: z.string(),
  raw: z.string(),
});

export type Log = z.infer<typeof LogSchema>;

export const WebhookSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  ownerId: z.string(),
  createdAt: z.number(),
});

export type Webhook = z.infer<typeof WebhookSchema>;

export const ConfigSchema = z.object({
  isHosted: z.boolean(),
  allowGuest: z.boolean(),
  ttlMs: z.number().optional(),
  maxInstancesPerOwner: z.number().optional(),
  rawLimitBytes: z.number(),
});

export type Config = z.infer<typeof ConfigSchema>;
