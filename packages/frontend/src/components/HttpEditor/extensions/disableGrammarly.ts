import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const disableGrammarlyExtension: Extension =
  EditorView.contentAttributes.of({
    spellcheck: "false",
    "data-enable-grammarly": "false",
    "data-gramm": "false",
    "data-gramm_editor": "false",
    "data-grammarly-extension": "false",
  });
