import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const readonlyEditorContentAttributes = {
  tabindex: "0",
  "aria-readonly": "true",
};

export const readonlyEditorExtensions: Extension[] = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.contentAttributes.of(readonlyEditorContentAttributes),
];
