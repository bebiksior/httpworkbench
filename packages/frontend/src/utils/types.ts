export const isAbsent = <T>(
  value: T | null | undefined,
): value is null | undefined => {
  return value === undefined || value === null;
};

export const isPresent = <T>(value: T | null | undefined): value is T => {
  return value !== undefined && value !== null;
};
