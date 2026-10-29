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

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, "Invalid username");

export const PasswordSignInSchema = z.object({
  username: UsernameSchema,
  password: z.string().min(1).max(1024),
});
