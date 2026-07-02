import { QueryClient } from "@tanstack/vue-query";
import { describe, expect, test } from "vitest";
import type { Instance, InstanceDetailResponse, Log } from "shared";
import { queryKeys } from "@/queries/keys";
import { buildInstanceDetailPlaceholder } from "./useInstanceDetail";

const makeInstance = (id: string): Instance => ({
  id,
  ownerId: "owner",
  createdAt: 1,
  webhookIds: [],
  public: false,
  locked: false,
  kind: "static",
  raw: "HTTP/1.1 200 OK\r\n\r\nok",
});

const makeDetail = (id: string): InstanceDetailResponse => ({
  instance: makeInstance(id),
  logs: [],
});

const makeLog = (id: string): Log => ({
  id,
  instanceId: "target",
  type: "http",
  timestamp: 1,
  address: "127.0.0.1",
  raw: "GET / HTTP/1.1",
});

describe("buildInstanceDetailPlaceholder", () => {
  test("ignores detail-shaped entries when searching list caches", () => {
    const queryClient = new QueryClient();
    const target = makeInstance("target");

    queryClient.setQueryData(
      [...queryKeys.instances.detail("other"), "user"],
      makeDetail("other"),
    );
    queryClient.setQueryData([...queryKeys.instances.all, "user"], [target]);

    expect(buildInstanceDetailPlaceholder(queryClient, "target")).toEqual({
      instance: target,
      logs: [],
    });
  });

  test("ignores child log data when searching detail caches", () => {
    const queryClient = new QueryClient();
    const targetDetail = makeDetail("target");

    queryClient.setQueryData(queryKeys.instances.logs("target"), [
      makeLog("log"),
    ]);
    queryClient.setQueryData(
      [...queryKeys.instances.detail("target"), "user"],
      targetDetail,
    );

    expect(buildInstanceDetailPlaceholder(queryClient, "target")).toEqual(
      targetDetail,
    );
  });
});
