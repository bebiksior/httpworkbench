declare const __APP_VERSION__: string;

const appVersion =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

const resolveEnvString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

export const buildConfig = (
  env: {
    VITE_DOMAIN?: string;
    VITE_INSTANCES_DOMAIN?: string;
  },
  version: string,
) => {
  const domain = resolveEnvString(env.VITE_DOMAIN) ?? "localhost";
  const instancesDomain =
    resolveEnvString(env.VITE_INSTANCES_DOMAIN) ?? `instances.${domain}`;

  return {
    version,
    domain,
    instancesDomain,
    githubRepo: "bebiksior/httpworkbench",
    getInstanceHost: (id: string) => `${id}.${instancesDomain}`,
    getInstanceUrl: (id: string) => `https://${id}.${instancesDomain}`,
  } as const;
};

export const config = buildConfig(
  {
    VITE_DOMAIN: import.meta.env.VITE_DOMAIN,
    VITE_INSTANCES_DOMAIN: import.meta.env.VITE_INSTANCES_DOMAIN,
  },
  appVersion,
);
