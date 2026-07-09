import { computed, effectScope, ref } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Instance } from "shared";

const mocks = vi.hoisted(() => ({
  updateInstance: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/queries/domains/useInstances", async () => {
  const { ref } = await import("vue");
  return {
    useUpdateInstance: () => ({
      mutateAsync: mocks.updateInstance,
      isPending: ref(false),
    }),
  };
});

vi.mock("@/composables", () => ({
  useNotify: () => ({ success: mocks.success, error: mocks.error }),
}));

import { useInstanceEditor } from "./useInstanceEditor";

const makeInstance = (raw: string, webhookIds: string[] = []): Instance => ({
  id: "instance-1",
  ownerId: "owner-1",
  createdAt: 1,
  webhookIds,
  public: false,
  locked: false,
  raw,
});

describe("useInstanceEditor", () => {
  beforeEach(() => {
    mocks.updateInstance.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  test("serializes saves and uses the latest confirmed raw for webhook updates", async () => {
    const instance = ref(makeInstance("old raw"));
    const scope = effectScope();
    const editor = scope.run(() =>
      useInstanceEditor(
        instance,
        computed(() => true),
      ),
    );
    expect(editor).toBeDefined();
    if (editor === undefined) return;

    let resolveRawSave: ((instance: Instance) => void) | undefined;
    mocks.updateInstance.mockImplementationOnce(
      () =>
        new Promise<Instance>((resolve) => {
          resolveRawSave = resolve;
        }),
    );

    editor.handleEditorChange("new raw");
    const rawSave = editor.handleSave();
    await editor.handleWebhookChange(["webhook-1"]);
    expect(mocks.updateInstance).toHaveBeenCalledTimes(1);

    resolveRawSave?.(makeInstance("new raw"));
    await rawSave;

    mocks.updateInstance.mockResolvedValueOnce(
      makeInstance("new raw", ["webhook-1"]),
    );
    await editor.handleWebhookChange(["webhook-1"]);

    expect(mocks.updateInstance).toHaveBeenLastCalledWith({
      id: "instance-1",
      input: { raw: "new raw", webhookIds: ["webhook-1"] },
    });
    scope.stop();
  });
});
