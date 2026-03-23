import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  password,
  select,
  spinner,
  text,
} from "@clack/prompts";
import type { CheckResult } from "./types";

export { intro, log, note, outro, spinner };

export const cancelled = (message: string): never => {
  cancel(message);
  process.exit(0);
};

const unwrapPrompt = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancelled(
      "Setup paused. Re-run the wizard to continue from the same step.",
    );
  }

  return value as T;
};

export const promptText = async (
  options: Parameters<typeof text>[0],
): Promise<string> => {
  return unwrapPrompt(await text(options));
};

export const promptPassword = async (
  options: Parameters<typeof password>[0],
): Promise<string> => {
  return unwrapPrompt(await password(options));
};

export const promptConfirm = async (
  options: Parameters<typeof confirm>[0],
): Promise<boolean> => {
  return unwrapPrompt(await confirm(options));
};

export const promptSelect = async <T extends string>(
  options: Parameters<typeof select>[0],
): Promise<T> => {
  return unwrapPrompt(await select(options)) as T;
};

export const renderChecks = (items: CheckResult[]): string => {
  return items
    .map((item) => `${item.ok ? "[ok]" : "[x]"} ${item.label}\n${item.details}`)
    .join("\n\n");
};
