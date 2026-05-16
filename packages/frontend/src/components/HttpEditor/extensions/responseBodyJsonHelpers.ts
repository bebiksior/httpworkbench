import { closeBrackets } from "@codemirror/autocomplete";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { highlightSpecialChars } from "@codemirror/view";

export const responseBodyJsonHelpers = (): Extension => {
  return [
    highlightSpecialChars(),
    indentOnInput(),
    bracketMatching({ brackets: "()[]{}" }),
    closeBrackets(),
  ];
};
