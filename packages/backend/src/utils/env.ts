export const parseBooleanEnv = (
  value: string | undefined,
): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const lower = value.toLowerCase();

  if (lower === "true" || lower === "1" || lower === "yes" || lower === "y") {
    return true;
  }

  if (
    lower === "false" ||
    lower === "0" ||
    lower === "no" ||
    lower === "n"
  ) {
    return false;
  }

  return undefined;
};
