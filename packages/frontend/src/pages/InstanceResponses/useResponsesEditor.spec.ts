import { effectScope, nextTick, ref } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Instance, InstanceRoute } from "shared";

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

import { FALLBACK_KEY, useResponsesEditor } from "./useResponsesEditor";

const OK = "HTTP/1.1 200 OK\r\n\r\n";

const makeInstance = (
  routes: InstanceRoute[] = [],
  raw = OK,
  id = "instance-1",
): Instance => ({
  id,
  ownerId: "owner-1",
  createdAt: 1,
  webhookIds: ["webhook-1"],
  public: false,
  locked: false,
  routes,
  raw,
});

const setup = (initial: Instance) => {
  const instance = ref(initial);
  const editor = effectScope().run(() => useResponsesEditor(instance));
  if (editor === undefined) throw new Error("editor not created");
  return { instance, editor };
};

const paths = (editor: ReturnType<typeof useResponsesEditor>) =>
  editor.rows.value.map((draft) => draft.path);

describe("useResponsesEditor", () => {
  beforeEach(() => {
    mocks.updateInstance.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  test("starts on the default response with rows in match priority", () => {
    const { editor } = setup(
      makeInstance([
        { path: "/*.js", raw: "js" },
        { path: "/login", raw: "login" },
        { path: "/api/*", raw: "api" },
      ]),
    );
    expect(editor.selected.value).toBe(FALLBACK_KEY);
    expect(editor.editorContent.value).toBe(OK);
    expect(paths(editor)).toEqual(["/login", "/api/*", "/*.js"]);
    expect(editor.isDirty.value).toBe(false);
  });

  test("edits the selected response and tracks dirtiness", () => {
    const { editor } = setup(makeInstance([{ path: "/a", raw: "a" }]));
    editor.setContent("fallback");
    expect(editor.fallbackRaw.value).toBe("fallback");
    expect(editor.isDirty.value).toBe(true);
    editor.setContent(OK);
    expect(editor.isDirty.value).toBe(false);

    expect(editor.selectByLabel("/a")).toBe(true);
    editor.setContent("changed");
    expect(editor.activeRoute.value?.raw).toBe("changed");
    expect(editor.fallbackRaw.value).toBe(OK);
    expect(editor.isDirty.value).toBe(true);
  });

  test("keeps the edited row in place until it is deselected", async () => {
    const { editor } = setup(
      makeInstance([
        { path: "/a", raw: "a" },
        { path: "/b", raw: "b" },
      ]),
    );
    const first = editor.rows.value[0];
    if (first === undefined) throw new Error("missing row");
    editor.select(first.key);
    await nextTick();
    editor.setPath(first.key, "/z");
    await nextTick();
    expect(paths(editor)).toEqual(["/z", "/b"]);

    editor.select(FALLBACK_KEY);
    await nextTick();
    expect(paths(editor)).toEqual(["/b", "/z"]);
  });

  test("adds paths with the current response and selects them", () => {
    const { editor } = setup(makeInstance());
    const key = editor.add("/login");
    expect(editor.selected.value).toBe(key);
    expect(editor.activeRoute.value).toMatchObject({
      path: "/login",
      raw: OK,
    });
    expect(editor.isDirty.value).toBe(true);
  });

  test("selects a neighbour after removing the selected path", async () => {
    const { editor } = setup(
      makeInstance([
        { path: "/a", raw: "a" },
        { path: "/b", raw: "b" },
      ]),
    );
    editor.selectByLabel("/a");
    await nextTick();
    editor.remove(editor.selected.value);
    expect(editor.activeRoute.value?.path).toBe("/b");
    editor.remove(editor.selected.value);
    expect(editor.selected.value).toBe(FALLBACK_KEY);
  });

  test("refuses to save invalid paths and selects the first problem", async () => {
    const { editor } = setup(makeInstance([{ path: "/a", raw: "a" }]));
    const key = editor.add();
    if (key === undefined) throw new Error("not added");
    editor.setPath(key, "nope");
    editor.select(FALLBACK_KEY);
    await nextTick();
    expect(editor.errors.value[key]).toBe("Must start with /");
    expect(editor.canSave.value).toBe(false);
    expect(await editor.save()).toBe(false);
    expect(editor.selected.value).toBe(key);
    expect(mocks.updateInstance).not.toHaveBeenCalled();
  });

  test("saves the default and every path in one update", async () => {
    const { instance, editor } = setup(makeInstance());
    editor.setContent("HTTP/1.1 404 Not Found\r\n\r\n");
    const key = editor.add("/login");
    if (key === undefined) throw new Error("not added");
    editor.setMethod(key, "GET");
    editor.setContent("HTTP/1.1 302 Found\r\n\r\n");

    const saved = makeInstance(
      [{ method: "GET", path: "/login", raw: "HTTP/1.1 302 Found\n\n" }],
      "HTTP/1.1 404 Not Found\n\n",
    );
    mocks.updateInstance.mockResolvedValueOnce(saved);
    expect(await editor.save()).toBe(true);
    expect(mocks.updateInstance).toHaveBeenCalledWith({
      id: "instance-1",
      input: {
        raw: "HTTP/1.1 404 Not Found\r\n\r\n",
        routes: [
          { method: "GET", path: "/login", raw: "HTTP/1.1 302 Found\r\n\r\n" },
        ],
      },
    });
    expect(editor.isDirty.value).toBe(false);

    instance.value = saved;
    await nextTick();
    expect(editor.selected.value).toBe(key);
    expect(editor.isDirty.value).toBe(false);
  });

  test("keeps unsaved edits when the instance refreshes", async () => {
    const { instance, editor } = setup(makeInstance());
    editor.add("/x");
    instance.value = makeInstance([], "HTTP/1.1 500 Oops\r\n\r\n");
    await nextTick();
    expect(paths(editor)).toEqual(["/x"]);
    expect(editor.fallbackRaw.value).toBe(OK);

    editor.discard();
    expect(paths(editor)).toEqual([]);
    expect(editor.fallbackRaw.value).toBe("HTTP/1.1 500 Oops\r\n\r\n");
    expect(editor.isDirty.value).toBe(false);
  });

  test("resets when switching to another instance", async () => {
    const { instance, editor } = setup(
      makeInstance([{ path: "/a", raw: "a" }]),
    );
    editor.selectByLabel("/a");
    editor.setContent("dirty");
    instance.value = makeInstance([{ path: "/b", raw: "b" }], OK, "other");
    await nextTick();
    expect(editor.selected.value).toBe(FALLBACK_KEY);
    expect(paths(editor)).toEqual(["/b"]);
    expect(editor.isDirty.value).toBe(false);
  });

  test("reports failed saves and stays dirty", async () => {
    const { editor } = setup(makeInstance());
    editor.setContent("x");
    mocks.updateInstance.mockRejectedValueOnce(new Error("boom"));
    expect(await editor.save()).toBe(false);
    expect(mocks.error).toHaveBeenCalled();
    expect(editor.isDirty.value).toBe(true);
  });
});
