export const config = {
  domain: import.meta.env.VITE_DOMAIN ?? "localhost",
  getInstanceHost: (id: string) => `${id}.instances.${config.domain}`,
  getInstanceUrl: (id: string) => `https://${id}.instances.${config.domain}`,
} as const;
