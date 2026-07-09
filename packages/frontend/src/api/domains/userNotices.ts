import { UserNoticesListResponseSchema } from "shared";
import { apiClient } from "../client";
import { parseResponse } from "../parseResponse";
import { apiPaths } from "../paths";

export const userNoticesApi = {
  getPending: async () => {
    const data = await apiClient.get<unknown>(apiPaths.userNotices);
    return parseResponse(UserNoticesListResponseSchema, data, "user notices")
      .notices;
  },
  acknowledge: async (noticeId: string): Promise<void> => {
    await apiClient.post<unknown>(apiPaths.userNoticeAck(noticeId), {});
  },
};
