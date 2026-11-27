import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, effectScope } from "vue";
import { expect, test, vi } from "vitest";
import { phonesApi } from "@/api/domains/phones";
import { queryKeys } from "../keys";
import { useSavePhoneProvider } from "./usePhones";

test("replacing a provider discards its cached numbers and SMS", async () => {
  const queryClient = new QueryClient();
  const app = createApp({}).use(VueQueryPlugin, { queryClient });
  const scope = effectScope();
  const smsKey = queryKeys.phones.sms("textverified:previous");
  queryClient.setQueryData(queryKeys.phones.all, [{ id: "previous" }]);
  queryClient.setQueryData(smsKey, { messages: [{ id: "old-code" }] });
  const provider = "textverified";
  const save = vi.spyOn(phonesApi, "saveProvider").mockResolvedValue({
    provider,
    credentials: { username: "replacement" },
    createdAt: 0,
  });
  try {
    await app.runWithContext(() =>
      scope.run(() =>
        useSavePhoneProvider().mutateAsync({
          provider,
          credentials: { username: "replacement", apiKey: "test" },
        }),
      ),
    );
    expect(queryClient.getQueryData(queryKeys.phones.all)).toBeUndefined();
    expect(queryClient.getQueryData(smsKey)).toBeUndefined();
  } finally {
    save.mockRestore();
    scope.stop();
    queryClient.clear();
  }
});
