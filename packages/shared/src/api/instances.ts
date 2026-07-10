import { z } from "zod";
import {
  GUEST_MANAGEMENT_TOKEN_PATTERN,
  GUEST_INSTANCE_RAW_LIMIT_BYTES,
  INSTANCE_RAW_LIMIT_BYTES,
  INSTANCE_ID_PATTERN,
  INSTANCE_SUMMARY_SUBSCRIPTION_BATCH_SIZE,
} from "../constants";
import { InstanceSchema, InstanceSummarySchema, LogSchema } from "../schemas";

export const CreateInstanceSchema = z
  .object({
    raw: z.string().max(INSTANCE_RAW_LIMIT_BYTES),
    webhookIds: z.array(z.string().min(1).max(100)).max(100).optional(),
  })
  .strict();

export type CreateInstanceInput = z.infer<typeof CreateInstanceSchema>;

export const UpdateInstanceSchema = z
  .object({
    raw: z.string().max(INSTANCE_RAW_LIMIT_BYTES),
    webhookIds: z.array(z.string().min(1).max(100)).max(100).optional(),
  })
  .strict();

export type UpdateInstanceInput = z.infer<typeof UpdateInstanceSchema>;

export const InstanceDetailResponseSchema = z.object({
  instance: InstanceSchema,
  logs: z.array(LogSchema),
  olderLogsCursor: z.string().optional(),
});

export type InstanceDetailResponse = z.infer<
  typeof InstanceDetailResponseSchema
>;

export const InstancesResponseSchema = z.array(InstanceSummarySchema);

export type InstancesResponse = z.infer<typeof InstancesResponseSchema>;

export const InstanceIdSchema = z.string().regex(INSTANCE_ID_PATTERN);
export const GuestManagementTokenSchema = z
  .string()
  .regex(GUEST_MANAGEMENT_TOKEN_PATTERN);

export const GuestInstanceReferenceSchema = z
  .object({
    id: InstanceIdSchema,
    token: GuestManagementTokenSchema,
  })
  .strict();

export type GuestInstanceReference = z.infer<
  typeof GuestInstanceReferenceSchema
>;

export const InstanceLogCountSchema = z
  .object({
    instanceId: InstanceIdSchema,
    count: z.number().int().nonnegative(),
  })
  .strict();

export type InstanceLogCount = z.infer<typeof InstanceLogCountSchema>;

export const InstanceSummaryStreamClientMessageSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ type: z.literal("ping") }).strict(),
    z
      .object({
        type: z.literal("subscribe"),
        generation: z.number().int().nonnegative(),
        instances: z
          .array(GuestInstanceReferenceSchema)
          .max(INSTANCE_SUMMARY_SUBSCRIPTION_BATCH_SIZE),
        complete: z.boolean(),
      })
      .strict(),
  ],
);

export type InstanceSummaryStreamClientMessage = z.infer<
  typeof InstanceSummaryStreamClientMessageSchema
>;

export const InstanceSummaryStreamServerMessageSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ type: z.literal("pong") }).strict(),
    z
      .object({
        type: z.literal("snapshot"),
        generation: z.number().int().nonnegative(),
        sequence: z.number().int().positive(),
        counts: z.array(InstanceLogCountSchema),
      })
      .strict(),
    z
      .object({
        type: z.literal("counts"),
        generation: z.number().int().nonnegative(),
        sequence: z.number().int().positive(),
        counts: z.array(InstanceLogCountSchema),
        removedInstanceIds: z.array(InstanceIdSchema),
      })
      .strict(),
  ],
);

export type InstanceSummaryStreamServerMessage = z.infer<
  typeof InstanceSummaryStreamServerMessageSchema
>;

export const CreateGuestInstanceSchema = z
  .object({ raw: z.string().max(GUEST_INSTANCE_RAW_LIMIT_BYTES) })
  .strict();

export type CreateGuestInstanceInput = z.infer<
  typeof CreateGuestInstanceSchema
>;

export const GuestInstanceCreateResponseSchema = z.object({
  instance: InstanceSchema,
  token: GuestManagementTokenSchema,
});

export type GuestInstanceCreateResponse = z.infer<
  typeof GuestInstanceCreateResponseSchema
>;

export const GuestInstanceSummariesRequestSchema = z
  .object({
    instances: z.array(GuestInstanceReferenceSchema).max(100),
  })
  .strict();

export type GuestInstanceSummariesRequest = z.infer<
  typeof GuestInstanceSummariesRequestSchema
>;

export const RecentLogsPageResponseSchema = z.object({
  logs: z.array(LogSchema),
  olderLogsCursor: z.string().optional(),
});

export type RecentLogsPageResponse = z.infer<
  typeof RecentLogsPageResponseSchema
>;

export const RenameInstanceSchema = z
  .object({
    label: z.string().max(100).optional(),
  })
  .strict();

export type RenameInstanceInput = z.infer<typeof RenameInstanceSchema>;

export const SetInstanceLockedSchema = z
  .object({
    locked: z.boolean(),
  })
  .strict();

export type SetInstanceLockedInput = z.infer<typeof SetInstanceLockedSchema>;

export const SetInstancePublicSchema = z
  .object({
    public: z.boolean(),
  })
  .strict();

export type SetInstancePublicInput = z.infer<typeof SetInstancePublicSchema>;
