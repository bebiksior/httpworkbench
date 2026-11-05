import {
  buildPublicConfig,
  normalizeDnsName,
  parseBooleanEnv,
  parseOptionalPositiveIntegerEnv,
  resolveDomain,
  resolveInstancesDomain,
} from "shared";

const defaultDnsPort = 53;
const defaultSmtpPort = 25;
const env: Record<string, string | undefined> = Bun.env;
const appConfig = buildPublicConfig(env);

const reapUnusedAfterHours = parseOptionalPositiveIntegerEnv(
  env.REAP_UNUSED_INSTANCES_AFTER_HOURS,
);

export const authMode = appConfig.authMode;

export const instancePolicies = {
  isHosted: appConfig.isHosted,
  allowGuest: appConfig.allowGuest,
  defaultTtlMs: appConfig.defaultTtlMs,
  maxTtlMs: appConfig.maxTtlMs,
  maxInstancesPerOwner: appConfig.maxInstancesPerOwner,
  rawLimitBytes: appConfig.rawLimitBytes,
  reapUnusedAfterMs:
    reapUnusedAfterHours === undefined
      ? undefined
      : reapUnusedAfterHours * 60 * 60 * 1000,
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

const buildDnsConfig = (
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

export type SmtpConfig = {
  smtpEnabled: boolean;
  instancesDomain: string;
  smtpPort?: number;
};

const buildSmtpConfig = (
  runtimeEnv: Record<string, string | undefined>,
): SmtpConfig => {
  const instancesDomain = resolveInstancesDomain(runtimeEnv);
  const smtpEnabled = parseBooleanEnv(runtimeEnv.SMTP_ENABLED) ?? false;
  if (!smtpEnabled) {
    return {
      smtpEnabled: false,
      instancesDomain,
    };
  }

  return {
    smtpEnabled: true,
    instancesDomain,
    smtpPort: parseIntegerEnv(runtimeEnv.SMTP_PORT, defaultSmtpPort),
  };
};

export const smtpConfig = buildSmtpConfig(env);

export type SmtpRelay = {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
};

export type MailSendingConfig = {
  enabled: boolean;
  relay?: SmtpRelay;
};

export const parseSmtpRelayUrl = (value: string | undefined) => {
  const source = value?.trim();
  if (source === undefined || source === "") {
    return undefined;
  }
  const url = new URL(source);
  if (url.protocol !== "smtp:" && url.protocol !== "smtps:") {
    throw new Error("SMTP_RELAY_URL must use smtp:// or smtps://");
  }
  const secure = url.protocol === "smtps:";
  const user = decodeURIComponent(url.username);
  return {
    name: url.hostname,
    host: url.hostname,
    port: url.port === "" ? (secure ? 465 : 587) : Number(url.port),
    secure,
    auth:
      user === ""
        ? undefined
        : { user, pass: decodeURIComponent(url.password) },
  } satisfies SmtpRelay;
};

const smtp2goRelay = (
  username: string | undefined,
  password: string | undefined,
): SmtpRelay | undefined => {
  const user = username?.trim() ?? "";
  const pass = password ?? "";
  if (user === "" && pass === "") {
    return undefined;
  }
  if (user === "" || pass === "") {
    throw new Error("Set both SMTP2GO_USERNAME and SMTP2GO_PASSWORD");
  }
  return {
    name: "SMTP2GO",
    host: "mail.smtp2go.com",
    port: 2525,
    secure: false,
    auth: { user, pass },
  };
};

export const resolveMailRelay = (
  runtimeEnv: Record<string, string | undefined>,
): SmtpRelay | undefined => {
  const custom = parseSmtpRelayUrl(runtimeEnv.SMTP_RELAY_URL);
  const smtp2go = smtp2goRelay(
    runtimeEnv.SMTP2GO_USERNAME,
    runtimeEnv.SMTP2GO_PASSWORD,
  );
  if (custom !== undefined && smtp2go !== undefined) {
    throw new Error(
      "Set either SMTP_RELAY_URL or SMTP2GO credentials, not both",
    );
  }
  return smtp2go ?? custom;
};

export const mailSendingConfig: MailSendingConfig = {
  enabled: appConfig.smtpSendingEnabled,
  relay: resolveMailRelay(env),
};
