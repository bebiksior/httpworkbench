import { keymap } from "@codemirror/view";

type SaveKeymapOptions = {
  onSave: () => void;
  canSave?: () => boolean;
};

export const createSaveKeymap = (options: SaveKeymapOptions) =>
  keymap.of([
    {
      key: "Mod-s",
      run: () => {
        if (options.canSave === undefined || options.canSave()) {
          options.onSave();
        }
        return true;
      },
      preventDefault: true,
    },
  ]);
