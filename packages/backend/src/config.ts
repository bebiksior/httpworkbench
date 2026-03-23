import { parseBooleanEnv } from "./utils/env";

const monthInMs = 30 * 24 * 60 * 60 * 1000;
const hostedInstanceLimit = 50;
const staticInstanceRawLimitBytes = 10 * 1024 * 1024;
const defaultDnsPort = 53;
const defaultInstancesSubdomain = "instances";
const env = typeof Bun !== "undefined" ? Bun.env : process.env;

const isHosted = parseBooleanEnv(env.IS_HOSTED) ?? false;
const allowGuest = parseBooleanEnv(env.ALLOW_GUEST) ?? true;

export const instancePolicies = {
  isHosted,
  allowGuest,
  ttlMs: isHosted ? monthInMs : undefined,
  maxInstancesPerOwner: isHosted ? hostedInstanceLimit : undefined,
  rawLimitBytes: staticInstanceRawLimitBytes,
};

export type DnsConfig = {
  dnsEnabled: boolean;
  instancesDomain: string;
  dnsPort?: number;
  dnsNameservers?: string[];
  publicIp?: string;
};

const parseIntegerEnv = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const normalizeDnsName = (value: string): string => {
  return value.trim().replace(/\.+$/, "").toLowerCase();
};

const parseNameservers = (
  value: string | undefined,
  domain: string | undefined,
): string[] | undefined => {
  const fallbackDomain =
    domain === undefined || domain === ""
      ? undefined
      : normalizeDnsName(domain);

  const defaults =
    fallbackDomain === undefined
      ? undefined
      : [`ns1.${fallbackDomain}`, `ns2.${fallbackDomain}`];

  const source = value?.trim() === "" ? undefined : value;
  const names = (source ?? defaults?.join(","))
    ?.split(",")
    .map((name) => normalizeDnsName(name))
    .filter((name) => name !== "");

  if (names === undefined || names.length === 0) {
    return undefined;
  }

  return names;
};

export const buildDnsConfig = (
  runtimeEnv: Record<string, string | undefined>,
): DnsConfig => {
  const domain = runtimeEnv.DOMAIN;
  const fallbackInstancesDomain =
    domain === undefined || domain === ""
      ? `${defaultInstancesSubdomain}.localhost`
      : `${defaultInstancesSubdomain}.${normalizeDnsName(domain)}`;
  const instancesDomain = normalizeDnsName(
    runtimeEnv.INSTANCES_DOMAIN ?? fallbackInstancesDomain,
  );
  const dnsEnabled = parseBooleanEnv(runtimeEnv.DNS_ENABLED) ?? false;
  if (!dnsEnabled) {
    return {
      dnsEnabled: false,
      instancesDomain,
    };
  }

  return {
    dnsEnabled: true,
    instancesDomain,
    dnsPort: parseIntegerEnv(runtimeEnv.DNS_PORT, defaultDnsPort),
    dnsNameservers: parseNameservers(runtimeEnv.DNS_NAMESERVERS, domain),
    publicIp: runtimeEnv.PUBLIC_IP?.trim(),
  };
};

export const dnsConfig = buildDnsConfig(env);
export const getCaddyAskSecret = () => env.CADDY_ASK_SECRET?.trim();

export const appConfig = {
  ...instancePolicies,
  dnsEnabled: dnsConfig.dnsEnabled,
  instancesDomain: dnsConfig.instancesDomain,
};
