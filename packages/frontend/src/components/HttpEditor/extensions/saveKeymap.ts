import { keymap } from "@codemirror/view";

export const createSaveKeymap = (onSave: () => void) =>
  keymap.of([
    {
      key: "Mod-s",
      run: () => {
        onSave();
        return true;
      },
      preventDefault: true,
    },
  ]);
