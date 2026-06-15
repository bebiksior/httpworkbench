import type { Config } from "./schemas";

const weekInMs = 7 * 24 * 60 * 60 * 1000;
const defaultInstanceTtlMs = 2 * weekInMs;
const maxInstanceTtlMs = 30 * 24 * 60 * 60 * 1000;
const hostedInstanceLimit = 100;
const staticInstanceRawLimitBytes = 10 * 1024 * 1024;
const defaultInstancesSubdomain = "instances";

export type PublicConfigEnv = {
  IS_HOSTED?: string;
  ALLOW_GUEST?: string;
  DNS_ENABLED?: string;
  DOMAIN?: string;
  INSTANCES_DOMAIN?: string;
};

const resolveEnvString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

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

  if (lower === "false" || lower === "0" || lower === "no" || lower === "n") {
    return false;
  }

  return undefined;
};

export const normalizeDnsName = (value: string): string => {
  return value.trim().replace(/\.+$/, "").toLowerCase();
};

export const resolveDomain = (
  value: string | undefined,
): string | undefined => {
  const domain = resolveEnvString(value);
  return domain === undefined ? undefined : normalizeDnsName(domain);
};

export const resolveInstancesDomain = (env: PublicConfigEnv): string => {
  const domain = resolveDomain(env.DOMAIN);
  const fallbackInstancesDomain =
    domain === undefined
      ? `${defaultInstancesSubdomain}.localhost`
      : `${defaultInstancesSubdomain}.${domain}`;
  const configuredInstancesDomain = resolveEnvString(env.INSTANCES_DOMAIN);

  return normalizeDnsName(configuredInstancesDomain ?? fallbackInstancesDomain);
};

export const buildPublicConfig = (env: PublicConfigEnv): Config => {
  const isHosted = parseBooleanEnv(env.IS_HOSTED) ?? false;

  return {
    isHosted,
    allowGuest: parseBooleanEnv(env.ALLOW_GUEST) ?? false,
    defaultTtlMs: isHosted ? defaultInstanceTtlMs : undefined,
    maxTtlMs: isHosted ? maxInstanceTtlMs : undefined,
    maxInstancesPerOwner: isHosted ? hostedInstanceLimit : undefined,
    rawLimitBytes: staticInstanceRawLimitBytes,
    dnsEnabled: parseBooleanEnv(env.DNS_ENABLED) ?? false,
    instancesDomain: resolveInstancesDomain(env),
  };
};
