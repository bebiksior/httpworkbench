declare const __APP_VERSION__: string;

export const config = {
  version: __APP_VERSION__,
  domain: import.meta.env.VITE_DOMAIN ?? "localhost",
  githubRepo: "bebiksior/httpworkbench",
  getInstanceHost: (id: string) => `${id}.instances.${config.domain}`,
  getInstanceUrl: (id: string) => `https://${id}.instances.${config.domain}`,
} as const;
