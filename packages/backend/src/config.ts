import {
  buildPublicConfig,
  normalizeDnsName,
  parseBooleanEnv,
  resolveDomain,
  resolveInstancesDomain,
} from "shared";

const defaultDnsPort = 53;
const env: Record<string, string | undefined> =
  typeof Bun !== "undefined" ? Bun.env : process.env;
const appConfig = buildPublicConfig(env);

export const instancePolicies = {
  isHosted: appConfig.isHosted,
  allowGuest: appConfig.allowGuest,
  ttlMs: appConfig.ttlMs,
  maxInstancesPerOwner: appConfig.maxInstancesPerOwner,
  rawLimitBytes: appConfig.rawLimitBytes,
};

export type DnsConfig = {
  dnsEnabled: boolean;
  instancesDomain: string;
  instancesAcmeChallengeDomain: string;
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

const parseNameservers = (
  value: string | undefined,
  domain: string | undefined,
): string[] | undefined => {
  const fallbackDomain = resolveDomain(domain);

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
  const normalizedDomain = resolveDomain(runtimeEnv.DOMAIN);
  const instancesDomain = resolveInstancesDomain(runtimeEnv);
  const fallbackInstancesAcmeChallengeDomain =
    normalizedDomain === undefined
      ? "_acme-challenge.instances-wildcard.localhost"
      : `_acme-challenge.instances-wildcard.${normalizedDomain}`;
  const instancesAcmeChallengeDomain = normalizeDnsName(
    runtimeEnv.INSTANCES_ACME_CHALLENGE_DOMAIN ??
      fallbackInstancesAcmeChallengeDomain,
  );
  const dnsEnabled = parseBooleanEnv(runtimeEnv.DNS_ENABLED) ?? false;
  if (!dnsEnabled) {
    return {
      dnsEnabled: false,
      instancesDomain,
      instancesAcmeChallengeDomain,
    };
  }

  return {
    dnsEnabled: true,
    instancesDomain,
    instancesAcmeChallengeDomain,
    dnsPort: parseIntegerEnv(runtimeEnv.DNS_PORT, defaultDnsPort),
    dnsNameservers: parseNameservers(
      runtimeEnv.DNS_NAMESERVERS,
      runtimeEnv.DOMAIN,
    ),
    publicIp: runtimeEnv.PUBLIC_IP?.trim(),
  };
};

export const dnsConfig = buildDnsConfig(env);
