import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildDefaultDnsDomain,
  buildDefaultNameservers,
  formatNameservers,
  normalizeDomain,
  normalizeNameservers,
} from "./config";
import type { SetupConfig } from "./types";

const parseBoolean = (value: string | undefined): boolean => {
  return value?.trim().toLowerCase() === "true";
};

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseEnvFile = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) {
    return {};
  }

  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split("\n");

  return lines.reduce<Record<string, string>>((accumulator, line) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      return accumulator;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      return accumulator;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key !== "") {
      accumulator[key] = value;
    }

    return accumulator;
  }, {});
};

export const getEnvFilePath = (rootDir: string): string => {
  return path.join(rootDir, ".env");
};

export const hasEnvFile = (rootDir: string): boolean => {
  return existsSync(getEnvFilePath(rootDir));
};

export const loadExistingConfig = (rootDir: string): Partial<SetupConfig> => {
  const env = parseEnvFile(getEnvFilePath(rootDir));
  const domain = normalizeDomain(env.DOMAIN ?? "");
  const frontendUrl = env.FRONTEND_URL?.trim();
  const dnsDomain =
    normalizeDomain(env.DNS_DOMAIN ?? "") ||
    (domain === "" ? "" : buildDefaultDnsDomain(domain));
  const dnsNameservers = normalizeNameservers(
    env.DNS_NAMESERVERS ??
      (domain === "" ? "" : formatNameservers(buildDefaultNameservers(domain))),
  );

  return {
    domain,
    frontendUrl:
      frontendUrl !== undefined && frontendUrl !== ""
        ? frontendUrl
        : domain === ""
          ? undefined
          : `https://${domain}`,
    jwtSecret: env.JWT_SECRET?.trim(),
    googleClientId: env.GOOGLE_CLIENT_ID?.trim(),
    googleClientSecret: env.GOOGLE_CLIENT_SECRET?.trim(),
    cloudflareApiToken: env.CLOUDFLARE_API_TOKEN?.trim(),
    dnsEnabled: parseBoolean(env.DNS_ENABLED),
    dnsDomain,
    dnsPort: parseInteger(env.DNS_PORT, 53),
    dnsNameservers,
  };
};

export const buildEnvFileContent = (config: SetupConfig): string => {
  return [
    `DOMAIN=${config.domain}`,
    `FRONTEND_URL=${config.frontendUrl}`,
    "",
    "API_PORT=8081",
    "INSTANCES_PORT=8082",
    "",
    `JWT_SECRET=${config.jwtSecret}`,
    `GOOGLE_CLIENT_ID=${config.googleClientId}`,
    `GOOGLE_CLIENT_SECRET=${config.googleClientSecret}`,
    "",
    `CLOUDFLARE_API_TOKEN=${config.cloudflareApiToken}`,
    "",
    "DATA_DIR=/app/data",
    "",
    "AUTO_HTTPS=on",
    "TLS_MAIN_DIRECTIVE=",
    "TLS_WILDCARD_DIRECTIVE=",
    "",
    "ALLOW_GUEST=false",
    "",
    `DNS_ENABLED=${config.dnsEnabled ? "true" : "false"}`,
    `DNS_DOMAIN=${config.dnsDomain}`,
    `DNS_PORT=${config.dnsPort}`,
    `DNS_NAMESERVERS=${formatNameservers(config.dnsNameservers)}`,
    "",
  ].join("\n");
};
