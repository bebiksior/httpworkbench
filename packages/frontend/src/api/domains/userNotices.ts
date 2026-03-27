import { UserNoticesListResponseSchema } from "shared";
import { apiClient } from "../client";
import { ValidationError } from "../errors";

export const userNoticesApi = {
  getPending: async () => {
    const data = await apiClient.get<unknown>("/api/user/notices");
    const result = UserNoticesListResponseSchema.safeParse(data);
    if (!result.success) {
      throw new ValidationError(
        `Invalid user notices response: ${result.error.message}`,
      );
    }
    return result.data.notices;
  },
  acknowledge: async (noticeId: string): Promise<void> => {
    await apiClient.post<unknown>(`/api/user/notices/${noticeId}/ack`, {});
  },
};
