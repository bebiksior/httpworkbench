import { z } from "zod";
import { InstanceSchema, LogSchema, ProcessorSchema } from "../schemas";

export const CreateStaticSchema = z.object({
  kind: z.literal("static"),
  raw: z.string(),
  webhookIds: z.array(z.string()).optional(),
});

export const CreateDynamicSchema = z.object({
  kind: z.literal("dynamic"),
  processors: z.array(ProcessorSchema),
  webhookIds: z.array(z.string()).optional(),
});

export const CreateInstanceSchema = z.union([
  CreateStaticSchema,
  CreateDynamicSchema,
]);

export type CreateInstanceInput = z.infer<typeof CreateInstanceSchema>;

export const UpdateStaticSchema = z.object({
  kind: z.literal("static"),
  raw: z.string(),
  webhookIds: z.array(z.string()).optional(),
});

export const UpdateDynamicSchema = z.object({
  kind: z.literal("dynamic"),
  processors: z.array(ProcessorSchema),
  webhookIds: z.array(z.string()).optional(),
});

export const UpdateInstanceSchema = z.union([
  UpdateStaticSchema,
  UpdateDynamicSchema,
]);

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
