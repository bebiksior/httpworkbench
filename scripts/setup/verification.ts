import { Resolver } from "node:dns/promises";
import { isValidIpv4 } from "./config";
import type { CheckResult, SetupConfig, VerificationResult } from "./types";

const normalizeName = (value: string): string => {
  return value.trim().replace(/\.+$/, "").toLowerCase();
};

const resolveWithFallback = async <T>(
  callback: (resolver: Resolver) => Promise<T>,
  servers?: string[],
): Promise<T | undefined> => {
  try {
    const resolver = new Resolver();
    if (servers !== undefined) {
      resolver.setServers(servers);
    }
    return await callback(resolver);
  } catch {
    return undefined;
  }
};

const resolveARecords = async (
  hostname: string,
  servers?: string[],
): Promise<string[]> => {
  const result = await resolveWithFallback(
    (resolver) => resolver.resolve4(hostname),
    servers,
  );
  return result ?? [];
};

const resolveNsRecords = async (
  hostname: string,
  servers?: string[],
): Promise<string[]> => {
  const result = await resolveWithFallback(
    (resolver) => resolver.resolveNs(hostname),
    servers,
  );
  return (result ?? []).map((value) => normalizeName(value));
};

const resolveSoaRecord = async (
  hostname: string,
  servers?: string[],
): Promise<string | undefined> => {
  const result = await resolveWithFallback(
    (resolver) => resolver.resolveSoa(hostname),
    servers,
  );

  if (result === undefined) {
    return undefined;
  }

  return `${normalizeName(result.nsname)} / ${normalizeName(result.hostmaster)}`;
};

export const detectPublicServerIp = async (): Promise<string | undefined> => {
  try {
    const response = await fetch("https://api.ipify.org", {
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return undefined;
    }

    const value = (await response.text()).trim();
    return isValidIpv4(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

export const formatRecords = (
  records: Array<{ host: string; type: string; value: string }>,
): string => {
  return records
    .map(
      (record) =>
        `${record.type.padEnd(4)} ${record.host.padEnd(36)} ${record.value}`,
    )
    .join("\n");
};

export const verifyMainDnsRecords = async (
  config: SetupConfig,
): Promise<VerificationResult> => {
  const wildcardProbe = `setup-check-${Date.now()}.instances.${config.domain}`;
  const [rootRecords, wildcardRecords] = await Promise.all([
    resolveARecords(config.domain),
    resolveARecords(wildcardProbe),
  ]);

  const items: CheckResult[] = [
    {
      label: `${config.domain} resolves to the server IP`,
      ok: rootRecords.includes(config.serverIp),
      details:
        rootRecords.length === 0
          ? "No A record is visible yet."
          : `Resolved to: ${rootRecords.join(", ")}`,
    },
    {
      label: `*.instances.${config.domain} wildcard resolves to the server IP`,
      ok: wildcardRecords.includes(config.serverIp),
      details:
        wildcardRecords.length === 0
          ? "The wildcard record is not visible yet."
          : `Resolved to: ${wildcardRecords.join(", ")}`,
    },
  ];

  return {
    success: items.every((item) => item.ok),
    items,
  };
};

export const verifyDnsDelegation = async (
  config: SetupConfig,
): Promise<VerificationResult> => {
  const [ns1Records, ns2Records, delegatedNameservers] = await Promise.all([
    resolveARecords(config.dnsNameservers[0] ?? ""),
    resolveARecords(config.dnsNameservers[1] ?? ""),
    resolveNsRecords(config.dnsDomain),
  ]);

  const expectedNameservers = config.dnsNameservers.map(normalizeName);
  const items: CheckResult[] = [
    {
      label: `${expectedNameservers[0]} resolves to the server IP`,
      ok: ns1Records.includes(config.serverIp),
      details:
        ns1Records.length === 0
          ? "No A record is visible yet."
          : `Resolved to: ${ns1Records.join(", ")}`,
    },
    {
      label: `${expectedNameservers[1]} resolves to the server IP`,
      ok: ns2Records.includes(config.serverIp),
      details:
        ns2Records.length === 0
          ? "No A record is visible yet."
          : `Resolved to: ${ns2Records.join(", ")}`,
    },
    {
      label: `${config.dnsDomain} delegates to the configured nameservers`,
      ok: expectedNameservers.every((nameserver) =>
        delegatedNameservers.includes(nameserver),
      ),
      details:
        delegatedNameservers.length === 0
          ? "No NS delegation is visible yet."
          : `Visible NS records: ${delegatedNameservers.join(", ")}`,
    },
  ];

  return {
    success: items.every((item) => item.ok),
    items,
  };
};

export const verifyHttpHealth = async (
  config: SetupConfig,
): Promise<VerificationResult> => {
  const httpsUrl = `https://${config.domain}/api/health`;
  const httpUrl = `http://${config.domain}/api/health`;

  try {
    const httpsResponse = await fetch(httpsUrl, {
      signal: AbortSignal.timeout(10_000),
    });
    const httpsBody = await httpsResponse.text();
    const httpsOk = httpsResponse.ok && httpsBody.includes('"status":"ok"');

    return {
      success: httpsOk,
      items: [
        {
          label: `${httpsUrl} returns a healthy response`,
          ok: httpsOk,
          details: `HTTP ${httpsResponse.status}: ${httpsBody.slice(0, 120)}`,
        },
      ],
    };
  } catch (httpsError) {
    try {
      const httpResponse = await fetch(httpUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      const httpBody = await httpResponse.text();
      const httpOk = httpResponse.ok && httpBody.includes('"status":"ok"');

      return {
        success: false,
        items: [
          {
            label: `${httpsUrl} is reachable with TLS`,
            ok: false,
            details:
              httpsError instanceof Error
                ? httpsError.message
                : "HTTPS request failed.",
          },
          {
            label: `${httpUrl} responds while certificates are provisioning`,
            ok: httpOk,
            details: `HTTP ${httpResponse.status}: ${httpBody.slice(0, 120)}`,
          },
        ],
      };
    } catch (httpError) {
      return {
        success: false,
        items: [
          {
            label: `${httpsUrl} returns a healthy response`,
            ok: false,
            details:
              httpsError instanceof Error
                ? httpsError.message
                : "HTTPS request failed.",
          },
          {
            label: `${httpUrl} returns a healthy response`,
            ok: false,
            details:
              httpError instanceof Error
                ? httpError.message
                : "HTTP request failed.",
          },
        ],
      };
    }
  }
};

export const verifyDnsService = async (
  config: SetupConfig,
): Promise<VerificationResult> => {
  const directServer = [config.serverIp];
  const [directSoa, directNs, publicSoa] = await Promise.all([
    resolveSoaRecord(config.dnsDomain, directServer),
    resolveNsRecords(config.dnsDomain, directServer),
    resolveSoaRecord(config.dnsDomain),
  ]);

  const expectedNameservers = config.dnsNameservers.map(normalizeName);
  const items: CheckResult[] = [
    {
      label: `The app answers SOA queries directly on ${config.serverIp}`,
      ok: directSoa !== undefined,
      details:
        directSoa === undefined
          ? "No authoritative SOA response yet."
          : `Direct SOA: ${directSoa}`,
    },
    {
      label: `The app answers NS queries directly on ${config.serverIp}`,
      ok: expectedNameservers.every((nameserver) =>
        directNs.includes(nameserver),
      ),
      details:
        directNs.length === 0
          ? "No NS response yet."
          : `Direct NS records: ${directNs.join(", ")}`,
    },
    {
      label: `Public resolvers can reach the delegated DNS zone`,
      ok: publicSoa !== undefined,
      details:
        publicSoa === undefined
          ? "Public SOA lookup is still failing."
          : `Public SOA: ${publicSoa}`,
    },
  ];

  return {
    success: items.every((item) => item.ok),
    items,
  };
};
