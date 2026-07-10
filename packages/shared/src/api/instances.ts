import { z } from "zod";
import { InstanceSchema, InstanceSummarySchema, LogSchema } from "../schemas";

export const CreateInstanceSchema = z.object({
  raw: z.string(),
  webhookIds: z.array(z.string()).optional(),
});

export type CreateInstanceInput = z.infer<typeof CreateInstanceSchema>;

export const UpdateInstanceSchema = z.object({
  raw: z.string(),
  webhookIds: z.array(z.string()).optional(),
});

export type UpdateInstanceInput = z.infer<typeof UpdateInstanceSchema>;

export const InstanceDetailResponseSchema = z.object({
  instance: InstanceSchema,
  logs: z.array(LogSchema),
});

export type InstanceDetailResponse = z.infer<
  typeof InstanceDetailResponseSchema
>;

export const InstancesResponseSchema = z.array(InstanceSummarySchema);

export type InstancesResponse = z.infer<typeof InstancesResponseSchema>;

export const GuestInstanceSummariesRequestSchema = z.object({
  ids: z.array(z.string()).max(100),
});

export type GuestInstanceSummariesRequest = z.infer<
  typeof GuestInstanceSummariesRequestSchema
>;

export const RenameInstanceSchema = z.object({
  label: z.string().max(100).optional(),
});

export type RenameInstanceInput = z.infer<typeof RenameInstanceSchema>;

export const SetInstanceLockedSchema = z.object({
  locked: z.boolean(),
});

export type SetInstanceLockedInput = z.infer<typeof SetInstanceLockedSchema>;

export const SetInstancePublicSchema = z.object({
  public: z.boolean(),
});

export type SetInstancePublicInput = z.infer<typeof SetInstancePublicSchema>;
