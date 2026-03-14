import { describe, expect, it } from "vitest";
import { httpEditorKeyBindings } from "./index";

describe("httpEditorKeyBindings", () => {
  it("keeps Mod-a scoped to the editor", () => {
    const selectAllBinding = httpEditorKeyBindings.find(
      (binding) => binding.key === "Mod-a",
    );

    expect(selectAllBinding).toBeDefined();
    expect(selectAllBinding?.preventDefault).toBe(true);
    expect(selectAllBinding?.run).toBeTypeOf("function");
  });

  it("keeps Tab reserved for inline hint acceptance", () => {
    const tabBinding = httpEditorKeyBindings.find(
      (binding) => binding.key === "Tab",
    );

    expect(tabBinding).toBeDefined();
    expect(tabBinding?.run).toBeTypeOf("function");
  });
});
