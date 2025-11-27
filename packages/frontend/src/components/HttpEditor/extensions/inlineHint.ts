import { RangeSetBuilder } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";

export type InlineHintSuggestion = {
  cursor: number;
  replaceFrom: number;
  replaceTo: number;
  insert: string;
  displayText: string;
};

type InlineHint = {
  extension: Extension;
  accept: (view: EditorView) => boolean;
};

type InlineHintOptions = {
  getSuggestion: (state: EditorState) => InlineHintSuggestion | undefined;
};

class InlineHintWidget extends WidgetType {
  private text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-inline-hint";
    span.textContent = this.text;
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

const buildDecorations = (suggestion: InlineHintSuggestion | undefined) => {
  if (suggestion === undefined) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  builder.add(
    suggestion.cursor,
    suggestion.cursor,
    Decoration.widget({
      widget: new InlineHintWidget(suggestion.displayText),
      side: 1,
    }),
  );
  return builder.finish();
};

export const createInlineHint = ({
  getSuggestion,
}: InlineHintOptions): InlineHint => {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      suggestion: InlineHintSuggestion | undefined;

      constructor(view: EditorView) {
        const { suggestion, decorations } = this.compute(view.state);
        this.suggestion = suggestion;
        this.decorations = decorations;
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) {
          const { suggestion, decorations } = this.compute(update.state);
          this.suggestion = suggestion;
          this.decorations = decorations;
        }
      }

      private compute(state: EditorState) {
        const suggestion = getSuggestion(state);
        return {
          suggestion,
          decorations: buildDecorations(suggestion),
        };
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );

  const accept = (view: EditorView) => {
    const pluginState = view.plugin(plugin);
    if (pluginState?.suggestion === undefined) {
      return false;
    }

    view.dispatch({
      changes: {
        from: pluginState.suggestion.replaceFrom,
        to: pluginState.suggestion.replaceTo,
        insert: pluginState.suggestion.insert,
      },
      selection: {
        anchor:
          pluginState.suggestion.replaceFrom +
          pluginState.suggestion.insert.length,
      },
    });

    return true;
  };

  return {
    extension: plugin,
    accept,
  };
};
