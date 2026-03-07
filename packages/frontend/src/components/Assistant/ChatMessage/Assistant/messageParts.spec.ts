import { describe, expect, test } from "vitest";
import { getDisplayParts } from "./messageParts";

describe("getDisplayParts", () => {
  test("keeps reasoning before text", () => {
    const parts = [
      { type: "reasoning", text: "Planning", state: "done" },
      { type: "text", text: "Hello", state: "done" },
    ] as const;

    expect(getDisplayParts([...parts] as never)).toEqual(parts);
  });

  test("drops reasoning after text", () => {
    const textPart = { type: "text", text: "Hello", state: "done" };
    const trailingReasoning = {
      type: "reasoning",
      text: "Post-answer reasoning",
      state: "done",
    };

    expect(getDisplayParts([textPart, trailingReasoning] as never)).toEqual([
      textPart,
    ]);
  });

  test("drops redacted reasoning blocks", () => {
    const textPart = { type: "text", text: "Hello", state: "done" };

    expect(
      getDisplayParts(
        [
          { type: "reasoning", text: "[REDACTED]", state: "done" },
          textPart,
        ] as never,
      ),
    ).toEqual([textPart]);
  });

  test("drops step markers and empty reasoning", () => {
    const textPart = { type: "text", text: "Hello", state: "done" };

    expect(
      getDisplayParts(
        [
          { type: "step-start" },
          { type: "reasoning", text: "   ", state: "done" },
          textPart,
        ] as never,
      ),
    ).toEqual([textPart]);
  });
});
