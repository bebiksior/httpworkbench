import { z } from "zod";
import { UserNoticeSchema } from "../schemas";

export const ApiKeySignInSchema = z.object({
  apiKey: z.string().min(1),
});

export type ApiKeySignInInput = z.infer<typeof ApiKeySignInSchema>;

export const UserNoticesListResponseSchema = z.object({
  notices: z.array(UserNoticeSchema),
});

export type UserNoticesListResponse = z.infer<
  typeof UserNoticesListResponseSchema
>;
