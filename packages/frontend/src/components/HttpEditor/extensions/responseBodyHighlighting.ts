import { htmlLanguage } from "@codemirror/lang-html";
import { jsonLanguage } from "@codemirror/lang-json";
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { highlightTree, classHighlighter } from "@lezer/highlight";
import type { ResponseBodySyntax } from "@/utils/httpResponse";
import { getResponseBodySyntaxSource } from "./responseBodySyntax";

type ResponseBodyHighlightRange = {
  from: number;
  to: number;
  classes: string;
};

const getBodyParser = (syntax: ResponseBodySyntax) => {
  if (syntax === "html") {
    return htmlLanguage.parser;
  }
  return jsonLanguage.parser;
};

export const getResponseBodyHighlightRanges = (
  raw: string,
): ResponseBodyHighlightRange[] => {
  const source = getResponseBodySyntaxSource(raw);
  if (source === undefined) {
    return [];
  }

  const ranges: ResponseBodyHighlightRange[] = [];
  const tree = getBodyParser(source.syntax).parse(source.body);

  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (classes === "") {
      return;
    }

    ranges.push({
      from: source.bodyStart + from,
      to: source.bodyStart + to,
      classes: `cm-response-body-${source.syntax} ${classes}`,
    });
  });

  return ranges;
};

const buildDecorations = (raw: string): DecorationSet => {
  const ranges = getResponseBodyHighlightRanges(raw);
  if (ranges.length === 0) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) {
    builder.add(
      range.from,
      range.to,
      Decoration.mark({ class: range.classes }),
    );
  }

  return builder.finish();
};

export const responseBodyHighlighting = (): Extension => {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view.state.doc.toString());
      }

      update(update: ViewUpdate) {
        if (!update.docChanged) {
          return;
        }

        this.decorations = buildDecorations(update.view.state.doc.toString());
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
};
