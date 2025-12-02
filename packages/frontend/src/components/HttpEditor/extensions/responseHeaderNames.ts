import type { EditorState } from "@codemirror/state";
import { responseHeaderNames } from "../constants/responseHeaders";
import { createInlineHint } from "./inlineHint";
import type { InlineHintSuggestion } from "./inlineHint";
import { isInHeaderSection } from "./utils";

const getSuggestion = (
  state: EditorState,
): InlineHintSuggestion | undefined => {
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return undefined;
  }

  const cursor = state.selection.main.head;
  const line = state.doc.lineAt(cursor);
  if (line.number === 1) {
    return undefined;
  }

  if (!isInHeaderSection(state, line.number)) {
    return undefined;
  }

  if (line.text.includes(":")) {
    return undefined;
  }

  const trailing = state.doc.sliceString(cursor, line.to);
  if (trailing.trim().length > 0) {
    return undefined;
  }

  const leadingWhitespaceLength = line.text.match(/^\s*/)?.[0].length ?? 0;
  const nameStart = line.from + leadingWhitespaceLength;
  if (cursor <= nameStart) {
    return undefined;
  }

  const typed = state.doc.sliceString(nameStart, cursor);
  if (typed.length === 0) {
    return undefined;
  }

  const typedLower = typed.toLowerCase();
  const header = responseHeaderNames.find((candidate) =>
    candidate.toLowerCase().startsWith(typedLower),
  );
  if (header === undefined) {
    return undefined;
  }

  const insert = `${header}: `;
  if (typed.length >= insert.length) {
    return undefined;
  }

  return {
    cursor,
    replaceFrom: nameStart,
    replaceTo: cursor,
    insert,
    displayText: insert.slice(typed.length),
  };
};

export const responseHeaderNameHint = createInlineHint({ getSuggestion });
