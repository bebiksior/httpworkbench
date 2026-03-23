declare const __APP_VERSION__: string;

export const config = {
  version: __APP_VERSION__,
  domain: import.meta.env.VITE_DOMAIN ?? "localhost",
  instancesDomain:
    import.meta.env.VITE_INSTANCES_DOMAIN ??
    `instances.${import.meta.env.VITE_DOMAIN ?? "localhost"}`,
  githubRepo: "bebiksior/httpworkbench",
  getInstanceHost: (id: string) => `${id}.${config.instancesDomain}`,
  getInstanceUrl: (id: string) => `https://${id}.${config.instancesDomain}`,
} as const;
