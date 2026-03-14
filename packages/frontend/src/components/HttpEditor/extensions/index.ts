import { Prec, type Extension } from "@codemirror/state";
import { keymap, type KeyBinding } from "@codemirror/view";
import { contentTypeValueHint } from "./contentTypeValues";
import { responseHeaderNameHint } from "./responseHeaderNames";
import { statusLabelHint } from "./statusLabel";

const hints = [statusLabelHint, responseHeaderNameHint, contentTypeValueHint];

const selectAllInEditor: KeyBinding["run"] = (view) => {
  view.dispatch(
    view.state.update({
      selection: {
        anchor: 0,
        head: view.state.doc.length,
      },
      userEvent: "select",
    }),
  );
  return true;
};

export const httpEditorKeyBindings: KeyBinding[] = [
  {
    key: "Mod-a",
    run: selectAllInEditor,
    preventDefault: true,
  },
  {
    key: "Tab",
    run: (view) => hints.some((hint) => hint.accept(view)),
  },
];

export const httpEditorExtensions: Extension[] = [
  ...hints.map((hint) => hint.extension),
  Prec.high(keymap.of(httpEditorKeyBindings)),
];
