import { buildPublicConfig, resolveDomain } from "shared";

declare const __APP_VERSION__: string;

const appVersion =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export const buildConfig = (
  env: {
    VITE_IS_HOSTED?: string;
    VITE_ALLOW_GUEST?: string;
    VITE_DNS_ENABLED?: string;
    VITE_DOMAIN?: string;
    VITE_INSTANCES_DOMAIN?: string;
  },
  version: string,
) => {
  const domain = resolveDomain(env.VITE_DOMAIN) ?? "localhost";
  const appConfig = buildPublicConfig({
    IS_HOSTED: env.VITE_IS_HOSTED,
    ALLOW_GUEST: env.VITE_ALLOW_GUEST,
    DNS_ENABLED: env.VITE_DNS_ENABLED,
    DOMAIN: env.VITE_DOMAIN,
    INSTANCES_DOMAIN: env.VITE_INSTANCES_DOMAIN,
  });

  return {
    ...appConfig,
    version,
    domain,
    githubRepo: "bebiksior/httpworkbench",
    getInstanceHost: (id: string) => `${id}.${appConfig.instancesDomain}`,
    getInstanceUrl: (id: string) =>
      `https://${id}.${appConfig.instancesDomain}`,
  } as const;
};

export const config = buildConfig(
  {
    VITE_IS_HOSTED: import.meta.env.VITE_IS_HOSTED,
    VITE_ALLOW_GUEST: import.meta.env.VITE_ALLOW_GUEST,
    VITE_DNS_ENABLED: import.meta.env.VITE_DNS_ENABLED,
    VITE_DOMAIN: import.meta.env.VITE_DOMAIN,
    VITE_INSTANCES_DOMAIN: import.meta.env.VITE_INSTANCES_DOMAIN,
  },
  appVersion,
);

export const getMcpEndpoint = (): string => {
  if (typeof window === "undefined") {
    return `https://${config.domain}/mcp`;
  }
  return `${window.location.origin}/mcp`;
};
