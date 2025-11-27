import type { UIMessage } from "ai";
import { z } from "zod";

// This is metadata of the entire message, not just the part
const messageStateSchema = z.enum(["streaming", "done", "error", "abort"]);
const _messageMetadataSchema = z.object({
  createdAt: z.number().optional(),
  finishedAt: z.number().optional(),
  state: messageStateSchema.optional(),
});

export type MessageState = z.infer<typeof messageStateSchema>;
export type MessageMetadata = z.infer<typeof _messageMetadataSchema>;
export type CustomUIMessage = UIMessage<MessageMetadata>;
