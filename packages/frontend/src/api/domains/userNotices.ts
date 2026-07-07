import { UserNoticesListResponseSchema } from "shared";
import { apiClient } from "../client";
import { ValidationError } from "../errors";
import { apiPaths } from "../paths";

export const userNoticesApi = {
  getPending: async () => {
    const data = await apiClient.get<unknown>(apiPaths.userNotices);
    const result = UserNoticesListResponseSchema.safeParse(data);
    if (!result.success) {
      throw new ValidationError(
        `Invalid user notices response: ${result.error.message}`,
      );
    }
    return result.data.notices;
  },
  acknowledge: async (noticeId: string): Promise<void> => {
    await apiClient.post<unknown>(apiPaths.userNoticeAck(noticeId), {});
  },
};
