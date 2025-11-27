import type { EditorState } from "@codemirror/state";
import { contentTypeValues } from "../constants/responseHeaders";
import { createInlineHint } from "./inlineHint";
import type { InlineHintSuggestion } from "./inlineHint";

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

  const colonIndex = line.text.indexOf(":");
  if (colonIndex === -1) {
    return undefined;
  }

  const headerName = line.text.slice(0, colonIndex).trim().toLowerCase();
  if (headerName !== "content-type") {
    return undefined;
  }

  const trailing = state.doc.sliceString(cursor, line.to);
  if (trailing.trim().length > 0) {
    return undefined;
  }

  const afterColon = line.text.slice(colonIndex + 1);
  const whitespaceLength = afterColon.match(/^\s*/)?.[0].length ?? 0;
  const valueStart = line.from + colonIndex + 1 + whitespaceLength;
  if (cursor < valueStart) {
    return undefined;
  }

  const typed = state.doc.sliceString(valueStart, cursor);
  if (typed.length === 0) {
    return undefined;
  }

  const typedLower = typed.toLowerCase();
  const candidate = contentTypeValues.find((value) =>
    value.toLowerCase().startsWith(typedLower),
  );
  if (candidate === undefined) {
    return undefined;
  }

  if (typed.length >= candidate.length) {
    return undefined;
  }

  return {
    cursor,
    replaceFrom: valueStart,
    replaceTo: cursor,
    insert: candidate,
    displayText: candidate.slice(typed.length),
  };
};

export const contentTypeValueHint = createInlineHint({ getSuggestion });
