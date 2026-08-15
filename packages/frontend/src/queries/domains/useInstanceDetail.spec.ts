import { QueryClient } from "@tanstack/vue-query";
import { describe, expect, test } from "vitest";
import type {
  Instance,
  InstanceDetailResponse,
  InstanceSummary,
  Log,
} from "shared";
import { queryKeys } from "@/queries/keys";
import {
  buildInstanceDetailPlaceholder,
  selectInstanceDetailPlaceholder,
} from "./useInstanceDetail";

const makeInstance = (id: string): Instance => ({
  id,
  ownerId: "owner",
  createdAt: 1,
  webhookIds: [],
  public: false,
  locked: false,
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
  test("constructs placeholder detail data from a matching list summary", () => {
    const queryClient = new QueryClient();
    const target: InstanceSummary = {
      id: "target",
      ownerId: "owner",
      createdAt: 1,
      public: false,
      locked: false,
      logCount: 0,
    };

    queryClient.setQueryData(
      [...queryKeys.instances.detail("other"), "user"],
      makeDetail("other"),
    );
    queryClient.setQueryData([...queryKeys.instances.all, "user"], [target]);

    expect(buildInstanceDetailPlaceholder(queryClient, "target")).toEqual({
      instance: {
        id: "target",
        ownerId: "owner",
        createdAt: 1,
        public: false,
        locked: false,
        raw: "",
        webhookIds: [],
      },
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

  test("does not reuse previous detail data for another instance", () => {
    const queryClient = new QueryClient();
    const target: InstanceSummary = {
      id: "target",
      ownerId: "owner",
      createdAt: 1,
      public: false,
      locked: false,
      logCount: 0,
    };
    queryClient.setQueryData([...queryKeys.instances.all, "user"], [target]);

    expect(
      selectInstanceDetailPlaceholder(
        queryClient,
        "target",
        makeDetail("other"),
      )?.instance.id,
    ).toBe("target");
  });
});
