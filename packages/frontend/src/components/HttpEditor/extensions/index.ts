import type { Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { contentTypeValueHint } from "./contentTypeValues";
import { responseHeaderNameHint } from "./responseHeaderNames";
import { statusLabelHint } from "./statusLabel";

const hints = [statusLabelHint, responseHeaderNameHint, contentTypeValueHint];

export const httpEditorExtensions: Extension[] = [
  ...hints.map((hint) => hint.extension),
  keymap.of([
    {
      key: "Tab",
      run: (view) => hints.some((hint) => hint.accept(view)),
    },
  ]),
];
