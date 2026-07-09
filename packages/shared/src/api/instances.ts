import { z } from "zod";
import { InstanceSchema, LogSchema } from "../schemas";

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

export const InstancesResponseSchema = z.array(InstanceSchema);

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
