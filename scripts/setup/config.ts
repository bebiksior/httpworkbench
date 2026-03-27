const ipv4Pattern =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export const normalizeDomain = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^[a-z]+:\/\//i, "");
  const [host] = withoutProtocol.split(/[/?#]/, 1);
  return (host ?? "").replace(/\.+$/, "");
};

export const isValidDomain = (value: string): boolean => {
  const normalized = normalizeDomain(value);
  if (normalized === "" || normalized.length > 253) {
    return false;
  }

  return normalized
    .split(".")
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9-]+$/i.test(label) &&
        !label.startsWith("-") &&
        !label.endsWith("-"),
    );
};

export const buildDefaultInstancesDomain = (domain: string): string => {
  return `instances.${normalizeDomain(domain)}`;
};

export const buildDefaultInstancesAcmeChallengeDomain = (
  domain: string,
): string => {
  return `_acme-challenge.instances-wildcard.${normalizeDomain(domain)}`;
};

export const buildDefaultNameservers = (domain: string): string[] => {
  const normalized = normalizeDomain(domain);
  return [`ns1.${normalized}`, `ns2.${normalized}`];
};

export const normalizeNameservers = (value: string | string[]): string[] => {
  const source = Array.isArray(value) ? value.join(",") : value;

  return source
    .split(",")
    .map((name) => normalizeDomain(name))
    .filter((name) => name !== "");
};

export const formatNameservers = (value: string[]): string => {
  return value.join(",");
};

export const isValidIpv4 = (value: string): boolean => {
  return ipv4Pattern.test(value.trim());
};
