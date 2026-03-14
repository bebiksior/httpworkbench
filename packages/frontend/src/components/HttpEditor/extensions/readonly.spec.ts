import { describe, expect, it } from "vitest";
import {
  readonlyEditorContentAttributes,
  readonlyEditorExtensions,
} from "./readonly";

describe("readonlyEditorExtensions", () => {
  it("keeps readonly editors keyboard-focusable", () => {
    expect(readonlyEditorContentAttributes).toEqual({
      tabindex: "0",
      "aria-readonly": "true",
    });
  });

  it("bundles the readonly editor behavior together", () => {
    expect(readonlyEditorExtensions).toHaveLength(3);
  });
});
