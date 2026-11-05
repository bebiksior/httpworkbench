import { Resolver } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { SmtpRelay } from "../../config";
import {
  SmtpConnectionError,
  sendSmtp,
  type SmtpClientOptions,
  type SmtpDeliveryResult,
  type SmtpEnvelope,
} from "../smtp/client";

export type DeliveryConfig = {
  instancesDomain: string;
  localSmtpPort: number;
  heloName: string;
  relay?: SmtpRelay;
};

export type DeliveryDeps = {
  send: (
    options: SmtpClientOptions,
    envelope: SmtpEnvelope,
  ) => Promise<SmtpDeliveryResult>;
  resolveMx: (
    domain: string,
  ) => Promise<{ exchange: string; priority: number }[]>;
  resolveAddresses: (host: string) => Promise<string[]>;
};

const commandTimeoutMs = 15_000;
const deliveryDeadlineMs = 45_000;
const maxMxHostsTried = 3;

const privateRanges = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  privateRanges.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(network, prefix, "ipv6");
}

export const isPublicAddress = (address: string) => {
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  return !privateRanges.check(address, family === 4 ? "ipv4" : "ipv6");
};

const settled = async <T>(promise: Promise<T>, fallback: T) => {
  try {
    return await promise;
  } catch {
    return fallback;
  }
};

const resolver = new Resolver({ timeout: 4_000, tries: 2 });

const defaultDeps: DeliveryDeps = {
  send: sendSmtp,
  resolveMx: (domain) => resolver.resolveMx(domain),
  resolveAddresses: async (host) => [
    ...(await settled(resolver.resolve4(host), [])),
    ...(await settled(resolver.resolve6(host), [])),
  ],
};

const rejectAll = (
  recipients: string[],
  error: string,
): SmtpDeliveryResult => ({
  accepted: [],
  rejected: recipients.map((address) => ({ address, error })),
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Delivery failed";

const domainOf = (address: string) =>
  address.slice(address.lastIndexOf("@") + 1).toLowerCase();

const isLocalRecipient = (address: string, instancesDomain: string) => {
  const domain = domainOf(address);
  return domain === instancesDomain || domain.endsWith(`.${instancesDomain}`);
};

const attempt = async (
  deps: DeliveryDeps,
  options: SmtpClientOptions,
  envelope: SmtpEnvelope,
) => {
  try {
    return await deps.send(options, envelope);
  } catch (error) {
    return rejectAll(envelope.to, errorMessage(error));
  }
};

const lookupMxHosts = async (
  deps: DeliveryDeps,
  domain: string,
): Promise<string[] | string> => {
  try {
    const records = await deps.resolveMx(domain);
    if (records.length === 0) {
      return [domain];
    }
    const hosts = records
      .toSorted((a, b) => a.priority - b.priority)
      .map(({ exchange }) => exchange.replace(/\.$/, ""));
    return hosts.every((host) => host === "")
      ? "Domain does not accept mail"
      : hosts.filter((host) => host !== "");
  } catch (error) {
    const code = (error as { code?: string }).code;
    return code === "ENODATA" ? [domain] : `Domain ${domain} not found`;
  }
};

const timing = (deadlineAt: number) => ({
  timeoutMs: commandTimeoutMs,
  deadlineMs: Math.max(0, deadlineAt - Date.now()),
});

const deliverToDomain = async (
  deps: DeliveryDeps,
  config: DeliveryConfig,
  domain: string,
  envelope: SmtpEnvelope,
  deadlineAt: number,
): Promise<SmtpDeliveryResult> => {
  const hosts = await lookupMxHosts(deps, domain);
  if (typeof hosts === "string") {
    return rejectAll(envelope.to, hosts);
  }

  let lastError = `No reachable mail server for ${domain}`;
  for (const host of hosts.slice(0, maxMxHostsTried)) {
    if (Date.now() >= deadlineAt) {
      break;
    }
    const [address] = (await deps.resolveAddresses(host)).filter(
      isPublicAddress,
    );
    if (address === undefined) {
      lastError = `${host} has no public address`;
      continue;
    }
    try {
      return await deps.send(
        {
          host,
          address,
          port: 25,
          tls: "opportunistic",
          verifyCertificate: false,
          heloName: config.heloName,
          ...timing(deadlineAt),
        },
        envelope,
      );
    } catch (error) {
      if (!(error instanceof SmtpConnectionError)) {
        return rejectAll(envelope.to, errorMessage(error));
      }
      lastError = `${host}: ${error.message}`;
    }
  }
  return rejectAll(envelope.to, lastError);
};

const groupByDomain = (recipients: string[]) => {
  const groups = new Map<string, string[]>();
  for (const recipient of recipients) {
    const domain = domainOf(recipient);
    groups.set(domain, [...(groups.get(domain) ?? []), recipient]);
  }
  return groups;
};

export const deliverMail = async (
  config: DeliveryConfig,
  envelope: SmtpEnvelope,
  deps: DeliveryDeps = defaultDeps,
): Promise<SmtpDeliveryResult> => {
  const deadlineAt = Date.now() + deliveryDeadlineMs;
  const local = envelope.to.filter((address) =>
    isLocalRecipient(address, config.instancesDomain),
  );
  const external = envelope.to.filter((address) => !local.includes(address));
  const tasks: Promise<SmtpDeliveryResult>[] = [];

  if (local.length > 0) {
    tasks.push(
      attempt(
        deps,
        {
          host: "127.0.0.1",
          port: config.localSmtpPort,
          tls: "none",
          verifyCertificate: false,
          heloName: config.heloName,
          ...timing(deadlineAt),
        },
        { ...envelope, to: local },
      ),
    );
  }

  const { relay } = config;
  if (external.length > 0 && relay !== undefined) {
    tasks.push(
      attempt(
        deps,
        {
          host: relay.host,
          port: relay.port,
          tls: relay.secure ? "implicit" : "starttls",
          verifyCertificate: true,
          auth: relay.auth,
          heloName: config.heloName,
          ...timing(deadlineAt),
        },
        { ...envelope, to: external },
      ).then((result) => ({
        accepted: result.accepted,
        rejected: result.rejected.map(({ address, error }) => ({
          address,
          error: `${relay.name}: ${error}`,
        })),
      })),
    );
  }

  if (relay === undefined) {
    for (const [domain, recipients] of groupByDomain(external)) {
      tasks.push(
        deliverToDomain(
          deps,
          config,
          domain,
          { ...envelope, to: recipients },
          deadlineAt,
        ),
      );
    }
  }

  const results = await Promise.all(tasks);
  return {
    accepted: results.flatMap((result) => result.accepted),
    rejected: results.flatMap((result) => result.rejected),
  };
};
