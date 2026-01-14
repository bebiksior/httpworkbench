import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const lightColors = {
  background: "#ffffff",
  foreground: "#1e293b",
  selection: "#d1d5db",
  cursor: "#1e293b",
  lineHighlight: "#f8fafc",
  gutterBackground: "#f8fafc",
  gutterForeground: "#64748b",
};

const lightTheme = EditorView.theme(
  {
    "&": {
      color: lightColors.foreground,
      backgroundColor: lightColors.background,
    },
    ".cm-content": {
      caretColor: lightColors.cursor,
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: lightColors.cursor,
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: lightColors.selection,
      },
    ".cm-panels": {
      backgroundColor: lightColors.gutterBackground,
      color: lightColors.foreground,
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid #e2e8f0",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid #e2e8f0",
    },
    ".cm-activeLine": {
      backgroundColor: lightColors.lineHighlight,
    },
    ".cm-gutters": {
      backgroundColor: lightColors.gutterBackground,
      color: lightColors.gutterForeground,
      border: "none",
      borderRight: "1px solid #e2e8f0",
    },
    ".cm-activeLineGutter": {
      backgroundColor: lightColors.lineHighlight,
    },
  },
  { dark: false },
);

const lightHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#7c3aed" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#1e293b" },
  { tag: [t.propertyName], color: "#0891b2" },
  {
    tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)],
    color: "#059669",
  },
  { tag: [t.function(t.variableName), t.labelName], color: "#2563eb" },
  {
    tag: [t.color, t.constant(t.name), t.standard(t.name)],
    color: "#d97706",
  },
  { tag: [t.definition(t.name), t.separator], color: "#1e293b" },
  { tag: [t.className], color: "#dc2626" },
  {
    tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace],
    color: "#d97706",
  },
  { tag: [t.typeName], color: "#0891b2" },
  { tag: [t.operator, t.operatorKeyword], color: "#7c3aed" },
  { tag: [t.url, t.escape, t.regexp, t.link], color: "#059669" },
  { tag: [t.meta, t.comment], color: "#64748b" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "#1e293b" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#d97706" },
  { tag: t.invalid, color: "#dc2626" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);

export const oneLight = [lightTheme, syntaxHighlighting(lightHighlightStyle)];
