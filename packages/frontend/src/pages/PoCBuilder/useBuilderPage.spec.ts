import { createPinia, setActivePinia } from "pinia";
import type { Instance, InstanceDetailResponse } from "shared";
import { effectScope, ref } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateInstance: vi.fn(),
  notifyError: vi.fn(),
  routerPush: vi.fn(),
}));

const instance = ref<Instance>({
  id: "instance-1",
  ownerId: "owner-1",
  createdAt: 1,
  webhookIds: ["webhook-1"],
  public: false,
  locked: false,
  raw: "HTTP/1.1 200 OK\r\n\r\n<h1>saved</h1>",
});
const data = ref<InstanceDetailResponse>({
  instance: instance.value,
  logs: [],
});

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("@/composables", () => ({
  useNotify: () => ({ error: mocks.notifyError }),
}));

vi.mock("@/queries/domains/useInstanceDetail", () => ({
  useInstanceDetail: () => ({
    data,
    isLoading: ref(false),
    error: ref<Error>(),
  }),
}));

vi.mock("@/queries/domains/useInstances", () => ({
  useUpdateInstance: () => ({
    mutateAsync: mocks.updateInstance,
    isPending: ref(false),
  }),
}));

import { formatResponse, useBuilderStore } from "@/stores";
import { useBuilderPage } from "./useBuilderPage";

const savedInstance = (raw: string): Instance => ({
  ...instance.value,
  raw,
});

describe("useBuilderPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    mocks.updateInstance.mockReset();
    mocks.notifyError.mockReset();
    mocks.routerPush.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("debounces editor saves", async () => {
    mocks.updateInstance.mockResolvedValue(savedInstance("saved"));
    const scope = effectScope();
    scope.run(() => useBuilderPage(ref(instance.value.id)));
    const builder = useBuilderStore();

    builder.setEditorContent("<h1>edited</h1>", "user");
    await vi.advanceTimersByTimeAsync(499);
    expect(mocks.updateInstance).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.updateInstance).toHaveBeenCalledWith({
      id: "instance-1",
      input: {
        raw: formatResponse("<h1>edited</h1>"),
        webhookIds: ["webhook-1"],
      },
    });
    expect(builder.isDirty).toBe(false);
    scope.stop();
  });

  test("serializes a newer edit behind an active save", async () => {
    let resolveFirstSave: ((value: Instance) => void) | undefined;
    mocks.updateInstance
      .mockImplementationOnce(
        () =>
          new Promise<Instance>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce(savedInstance("second"));

    const scope = effectScope();
    scope.run(() => useBuilderPage(ref(instance.value.id)));
    const builder = useBuilderStore();

    builder.setEditorContent("first", "user");
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.updateInstance).toHaveBeenCalledTimes(1);

    builder.setEditorContent("second", "user");
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.updateInstance).toHaveBeenCalledTimes(1);
    expect(builder.isDirty).toBe(true);

    resolveFirstSave?.(savedInstance("first"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.updateInstance).toHaveBeenCalledTimes(2);
    expect(mocks.updateInstance).toHaveBeenLastCalledWith({
      id: "instance-1",
      input: {
        raw: formatResponse("second"),
        webhookIds: ["webhook-1"],
      },
    });
    expect(builder.isDirty).toBe(false);
    scope.stop();
  });
});
