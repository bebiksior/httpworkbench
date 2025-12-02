import type { EditorState } from "@codemirror/state";

export const isInHeaderSection = (
  state: EditorState,
  lineNumber: number,
): boolean => {
  for (let i = 2; i < lineNumber; i++) {
    const line = state.doc.line(i);
    if (line.text.trim() === "") {
      return false;
    }
  }
  return true;
};
