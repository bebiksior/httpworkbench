import type { CustomUIMessage } from "@/agent/types";

type AssistantPart = CustomUIMessage["parts"][number];

const REDACTED_REASONING_TEXT = "[REDACTED]";

const isDisplayableReasoningPart = (
  part: Extract<AssistantPart, { type: "reasoning" }>,
  hasSeenText: boolean,
) => {
  const trimmed = part.text.trim();

  if (trimmed === "") {
    return false;
  }

  if (trimmed === REDACTED_REASONING_TEXT) {
    return false;
  }

  // OpenRouter Gemini can emit an extra encrypted reasoning block after the
  // answer text. Hiding post-text reasoning keeps the UI aligned with the
  // actual conversational turn.
  if (hasSeenText) {
    return false;
  }

  return true;
};

export const getDisplayParts = (parts: AssistantPart[]) => {
  const displayParts: AssistantPart[] = [];
  let hasSeenText = false;

  for (const part of parts) {
    if (part.type === "step-start") {
      continue;
    }

    if (part.type === "text") {
      displayParts.push(part);
      hasSeenText = true;
      continue;
    }

    if (part.type === "reasoning") {
      if (isDisplayableReasoningPart(part, hasSeenText)) {
        displayParts.push(part);
      }
      continue;
    }

    displayParts.push(part);
  }

  return displayParts;
};
