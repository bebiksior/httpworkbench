import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { http } from "@codemirror/legacy-modes/mode/http";
import { simpleMode } from "@codemirror/legacy-modes/mode/simple-mode";
import { responseBodyJsonHelpers } from "./extensions/responseBodyJsonHelpers";
import { responseBodyHighlighting } from "./extensions/responseBodyHighlighting";

export type EditorSyntax = "dns" | "http" | "response";

const dns = simpleMode({
  start: [
    {
      regex: /(QNAME:|ZONE:)(\s+.+)/,
      token: ["propertyName", "string"],
    },
    {
      regex: /(QTYPE:|QCLASS:|TRANSPORT:)(\s+[A-Z0-9_-]+)/,
      token: ["propertyName", "atom"],
    },
    {
      regex: /([A-Z_]+:)(\s+.+)/,
      token: ["propertyName", "variableName"],
    },
  ],
});

const editorLanguageExtensions: Record<EditorSyntax, Extension> = {
  dns: StreamLanguage.define(dns),
  http: StreamLanguage.define(http),
  response: [
    StreamLanguage.define(http),
    responseBodyHighlighting(),
    responseBodyJsonHelpers(),
  ],
};

export const getEditorLanguageExtension = (
  syntax: EditorSyntax = "http",
): Extension => {
  return editorLanguageExtensions[syntax];
};
