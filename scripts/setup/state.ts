import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";
import type { SetupState } from "./types";

const stateDirectoryName = ".httpworkbench";
const stateFileName = "setup-state.json";

export const getStateFilePath = (rootDir: string): string => {
  return path.join(rootDir, stateDirectoryName, stateFileName);
};

export const loadState = (rootDir: string): SetupState | undefined => {
  const filePath = getStateFilePath(rootDir);
  if (!existsSync(filePath)) {
    return undefined;
  }

  try {
    const content = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content) as SetupState;
    if (parsed.version !== 1) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
};

export const saveState = (rootDir: string, state: SetupState): void => {
  const filePath = getStateFilePath(rootDir);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2));
};

export const clearState = (rootDir: string): void => {
  const filePath = getStateFilePath(rootDir);
  rmSync(filePath, { force: true });
};
