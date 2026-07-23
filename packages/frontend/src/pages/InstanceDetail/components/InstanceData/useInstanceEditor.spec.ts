import { computed, effectScope, nextTick, ref } from "vue";
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

const makeInstance = (
  raw: string,
  webhookIds: string[] = [],
  id = "instance-1",
): Instance => ({
  id,
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

  test("resets dirty raw content and webhooks when the route reuses the editor", async () => {
    const instance = ref(makeInstance("first raw", ["webhook-1"]));
    const scope = effectScope();
    const editor = scope.run(() =>
      useInstanceEditor(
        instance,
        computed(() => true),
      ),
    );
    expect(editor).toBeDefined();
    if (editor === undefined) return;

    editor.handleEditorChange("unsaved first raw");
    instance.value = makeInstance("second raw", ["webhook-2"], "instance-2");
    await nextTick();

    expect(editor.rawContent.value).toBe("second raw");
    expect(editor.isDirty.value).toBe(false);
    expect(editor.selectedWebhookIds.value).toEqual(["webhook-2"]);

    mocks.updateInstance.mockResolvedValueOnce(instance.value);
    await editor.handleSave();
    expect(mocks.updateInstance).toHaveBeenCalledWith({
      id: "instance-2",
      input: { raw: "second raw", webhookIds: ["webhook-2"] },
    });
    scope.stop();
  });

  test("ignores an old instance webhook response after navigation", async () => {
    const instance = ref(makeInstance("first raw", ["webhook-1"]));
    const scope = effectScope();
    const editor = scope.run(() =>
      useInstanceEditor(
        instance,
        computed(() => true),
      ),
    );
    expect(editor).toBeDefined();
    if (editor === undefined) return;

    let resolveWebhookSave: ((instance: Instance) => void) | undefined;
    mocks.updateInstance.mockImplementationOnce(
      () =>
        new Promise<Instance>((resolve) => {
          resolveWebhookSave = resolve;
        }),
    );
    const webhookSave = editor.handleWebhookChange(["pending-webhook"]);

    instance.value = makeInstance("second raw", ["webhook-2"], "instance-2");
    await nextTick();
    resolveWebhookSave?.(
      makeInstance("first raw", ["pending-webhook"], "instance-1"),
    );
    await webhookSave;

    expect(editor.rawContent.value).toBe("second raw");
    expect(editor.selectedWebhookIds.value).toEqual(["webhook-2"]);
    scope.stop();
  });
});
