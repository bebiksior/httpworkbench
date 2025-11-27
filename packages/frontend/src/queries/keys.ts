export const queryKeys = {
  instances: {
    all: ["instances"] as const,
    detail: (id: string) => ["instances", id] as const,
    logs: (id: string) => ["instances", id, "logs"] as const,
  },
  auth: {
    user: ["auth", "user"] as const,
  },
  webhooks: {
    all: ["webhooks"] as const,
  },
} as const;

export const WEBHOOKS_QUERY_KEY = "webhooks";
