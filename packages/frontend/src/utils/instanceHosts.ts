export const getDnsInstanceHost = (
  id: string,
  dnsDomain: string | undefined,
): string | undefined => {
  if (dnsDomain === undefined || dnsDomain === "") {
    return undefined;
  }

  return `${id}.${dnsDomain}`;
};
