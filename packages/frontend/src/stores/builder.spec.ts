import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import { DEFAULT_TEMPLATE, useBuilderStore } from "./builder";
import { useResponseEditorStore } from "./responseEditor";

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("useBuilderStore", () => {
  test("marks the editor dirty on user and agent edits", async () => {
    const builder = useBuilderStore();

    builder.setEditorContent("<h1>edited</h1>", "user");
    await nextTick();
    expect(builder.isDirty).toBe(true);

    builder.hydrateEditor("HTTP/1.1 200 OK\r\n\r\n<h1>saved</h1>");
    await nextTick();
    expect(builder.isDirty).toBe(false);

    useResponseEditorStore().setContent("<h1>from agent</h1>", "agent");
    await nextTick();
    expect(builder.isDirty).toBe(true);
  });

  test("stays dirty for edits made after a save", async () => {
    const builder = useBuilderStore();

    builder.setEditorContent("<h1>first</h1>", "user");
    await nextTick();

    builder.isDirty = false;

    builder.setEditorContent("<h1>second</h1>", "user");
    await nextTick();
    expect(builder.isDirty).toBe(true);
  });

  test("resets to a clean default state", async () => {
    const builder = useBuilderStore();

    builder.showPreview = true;
    builder.showAssistant = false;
    builder.setEditorContent("<h1>edited</h1>", "user");
    await nextTick();

    builder.reset();
    await nextTick();

    expect(builder.isDirty).toBe(false);
    expect(builder.showPreview).toBe(false);
    expect(builder.showAssistant).toBe(true);
    expect(builder.editorContent).toBe(DEFAULT_TEMPLATE);
  });

  test("toggles assistant visibility", () => {
    const builder = useBuilderStore();

    builder.toggleAssistant();
    expect(builder.showAssistant).toBe(false);

    builder.toggleAssistant();
    expect(builder.showAssistant).toBe(true);
  });
});
