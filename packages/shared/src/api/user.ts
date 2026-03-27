import { z } from "zod";
import { UserNoticeSchema } from "../schemas";

export const UserNoticesListResponseSchema = z.object({
  notices: z.array(UserNoticeSchema),
});

export type UserNoticesListResponse = z.infer<
  typeof UserNoticesListResponseSchema
>;
