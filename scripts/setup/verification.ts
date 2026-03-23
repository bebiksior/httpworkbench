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

export const buildVerificationResult = (
  items: CheckResult[],
): VerificationResult => {
  return {
    success: items.every((item) => item.ok),
    items,
  };
};

export const buildMainDnsRecordsResult = (params: {
  config: SetupConfig;
  rootRecords: string[];
  ns1Records: string[];
  ns2Records: string[];
}): VerificationResult => {
  const { config, rootRecords, ns1Records, ns2Records } = params;
  const expectedNs1 = config.dnsNameservers[0] ?? "ns1";
  const expectedNs2 = config.dnsNameservers[1] ?? "ns2";

  return buildVerificationResult([
    {
      label: `${config.domain} resolves to the server IP`,
      ok: rootRecords.includes(config.serverIp),
      details:
        rootRecords.length === 0
          ? "No A record is visible yet."
          : `Resolved to: ${rootRecords.join(", ")}`,
    },
    {
      label: `${expectedNs1} resolves to the server IP`,
      ok: ns1Records.includes(config.serverIp),
      details:
        ns1Records.length === 0
          ? "No A record is visible yet."
          : `Resolved to: ${ns1Records.join(", ")}`,
    },
    {
      label: `${expectedNs2} resolves to the server IP`,
      ok: ns2Records.includes(config.serverIp),
      details:
        ns2Records.length === 0
          ? "No A record is visible yet."
          : `Resolved to: ${ns2Records.join(", ")}`,
    },
  ]);
};

export const buildDnsDelegationResult = (params: {
  config: SetupConfig;
  ns1Records: string[];
  ns2Records: string[];
  delegatedNameservers: string[];
}): VerificationResult => {
  const { config, ns1Records, ns2Records, delegatedNameservers } = params;
  const expectedNameservers = config.dnsNameservers.map(normalizeName);

  return buildVerificationResult([
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
      label: `${config.instancesDomain} delegates to the configured nameservers`,
      ok: expectedNameservers.every((nameserver) =>
        delegatedNameservers.includes(nameserver),
      ),
      details:
        delegatedNameservers.length === 0
          ? "No NS delegation is visible yet."
          : `Visible NS records: ${delegatedNameservers.join(", ")}`,
    },
  ]);
};

export const buildHttpHealthSuccessResult = (params: {
  httpsUrl: string;
  status: number;
  body: string;
}): VerificationResult => {
  const { httpsUrl, status, body } = params;
  const httpsOk =
    status >= 200 && status < 300 && body.includes('"status":"ok"');

  return buildVerificationResult([
    {
      label: `${httpsUrl} returns a healthy response`,
      ok: httpsOk,
      details: `HTTP ${status}: ${body.slice(0, 120)}`,
    },
  ]);
};

export const buildHttpHealthFallbackResult = (params: {
  httpsUrl: string;
  httpUrl: string;
  httpsError: unknown;
  httpStatus?: number;
  httpBody?: string;
  httpError?: unknown;
}): VerificationResult => {
  const httpsMessage =
    params.httpsError instanceof Error
      ? params.httpsError.message
      : "HTTPS request failed.";

  if (params.httpError !== undefined) {
    return buildVerificationResult([
      {
        label: `${params.httpsUrl} returns a healthy response`,
        ok: false,
        details: httpsMessage,
      },
      {
        label: `${params.httpUrl} returns a healthy response`,
        ok: false,
        details:
          params.httpError instanceof Error
            ? params.httpError.message
            : "HTTP request failed.",
      },
    ]);
  }

  const httpBody = params.httpBody ?? "";
  const httpStatus = params.httpStatus ?? 0;
  const httpOk =
    httpStatus >= 200 && httpStatus < 300 && httpBody.includes('"status":"ok"');

  return buildVerificationResult([
    {
      label: `${params.httpsUrl} is reachable with TLS`,
      ok: false,
      details: httpsMessage,
    },
    {
      label: `${params.httpUrl} responds while certificates are provisioning`,
      ok: httpOk,
      details: `HTTP ${httpStatus}: ${httpBody.slice(0, 120)}`,
    },
  ]);
};

export const buildDnsServiceResult = (params: {
  config: SetupConfig;
  directSoa?: string;
  directNs: string[];
  publicSoa?: string;
}): VerificationResult => {
  const { config, directSoa, directNs, publicSoa } = params;
  const expectedNameservers = config.dnsNameservers.map(normalizeName);

  return buildVerificationResult([
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
  ]);
};

export const verifyMainDnsRecords = async (
  config: SetupConfig,
): Promise<VerificationResult> => {
  const [rootRecords, ns1Records, ns2Records] = await Promise.all([
    resolveARecords(config.domain),
    resolveARecords(config.dnsNameservers[0] ?? ""),
    resolveARecords(config.dnsNameservers[1] ?? ""),
  ]);

  return buildMainDnsRecordsResult({
    config,
    rootRecords,
    ns1Records,
    ns2Records,
  });
};

export const verifyDnsDelegation = async (
  config: SetupConfig,
): Promise<VerificationResult> => {
  const [ns1Records, ns2Records, delegatedNameservers] = await Promise.all([
    resolveARecords(config.dnsNameservers[0] ?? ""),
    resolveARecords(config.dnsNameservers[1] ?? ""),
    resolveNsRecords(config.instancesDomain),
  ]);

  return buildDnsDelegationResult({
    config,
    ns1Records,
    ns2Records,
    delegatedNameservers,
  });
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
    return buildHttpHealthSuccessResult({
      httpsUrl,
      status: httpsResponse.status,
      body: httpsBody,
    });
  } catch (httpsError) {
    try {
      const httpResponse = await fetch(httpUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      const httpBody = await httpResponse.text();
      return buildHttpHealthFallbackResult({
        httpsUrl,
        httpUrl,
        httpsError,
        httpStatus: httpResponse.status,
        httpBody,
      });
    } catch (httpError) {
      return buildHttpHealthFallbackResult({
        httpsUrl,
        httpUrl,
        httpsError,
        httpError,
      });
    }
  }
};

export const verifyDnsService = async (
  config: SetupConfig,
): Promise<VerificationResult> => {
  const directServer = [config.serverIp];
  const [directSoa, directNs, publicSoa] = await Promise.all([
    resolveSoaRecord(config.instancesDomain, directServer),
    resolveNsRecords(config.instancesDomain, directServer),
    resolveSoaRecord(config.instancesDomain),
  ]);

  return buildDnsServiceResult({
    config,
    directSoa,
    directNs,
    publicSoa,
  });
};
