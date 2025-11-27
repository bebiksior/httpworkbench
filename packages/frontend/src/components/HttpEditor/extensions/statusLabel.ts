import type { EditorState } from "@codemirror/state";
import { statusCodeLabels } from "../constants/statusCodeLabels";
import { createInlineHint } from "./inlineHint";
import type { InlineHintSuggestion } from "./inlineHint";

const getSuggestion = (
  state: EditorState,
): InlineHintSuggestion | undefined => {
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return undefined;
  }

  const cursor = state.selection.main.head;
  const firstLine = state.doc.line(1);
  if (cursor < firstLine.from || cursor > firstLine.to) {
    return undefined;
  }

  const codeMatch = /^HTTP\/\d+(?:\.\d+)?\s+(\d{3})/i.exec(firstLine.text);
  if (codeMatch === null) {
    return undefined;
  }

  const statusCode = codeMatch[1];
  if (statusCode === undefined) {
    return undefined;
  }
  const label = statusCodeLabels[statusCode];
  if (label === undefined) {
    return undefined;
  }

  const codeEnd = firstLine.from + codeMatch[0].length;
  if (cursor < codeEnd) {
    return undefined;
  }

  const lineRest = firstLine.text.slice(codeMatch[0].length);
  const whitespaceMatch = lineRest.match(/^\s*/);
  const whitespaceLength = whitespaceMatch?.[0].length ?? 0;
  const labelStart = codeEnd + whitespaceLength;
  if (cursor < labelStart) {
    return undefined;
  }

  const trailing = state.doc.sliceString(cursor, firstLine.to);
  if (trailing.trim().length > 0) {
    return undefined;
  }

  const typed = state.doc.sliceString(labelStart, cursor);
  const labelLower = label.toLowerCase();
  const typedLower = typed.toLowerCase();
  if (typedLower.length > 0) {
    if (!labelLower.startsWith(typedLower)) {
      return undefined;
    }
    if (typedLower.length >= labelLower.length) {
      return undefined;
    }
  }

  const remainder = typedLower.length === 0 ? label : label.slice(typed.length);
  if (remainder.length === 0) {
    return undefined;
  }

  const widgetText =
    typedLower.length === 0 && whitespaceLength === 0
      ? ` ${remainder}`
      : remainder;

  return {
    cursor,
    replaceFrom: codeEnd,
    replaceTo: firstLine.to,
    insert: ` ${label}`,
    displayText: widgetText,
  };
};

export const statusLabelHint = createInlineHint({ getSuggestion });
