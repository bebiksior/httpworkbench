import { path } from "urlguard";

export const apiPaths = {
  apiKey: (id: string) => path("/api/api-keys/:id", { id }),
  apiKeys: "/api/api-keys",
  guestInstance: (id: string) => path("/api/guest/instances/:id", { id }),
  guestInstanceLogs: (id: string) =>
    path("/api/guest/instances/:id/logs", { id }),
  guestInstanceLock: (id: string) =>
    path("/api/guest/instances/:id/lock", { id }),
  guestInstances: "/api/guest/instances",
  guestInstanceSummaries: "/api/guest/instances/list",
  instance: (id: string) => path("/api/instances/:id", { id }),
  instanceExtend: (id: string) => path("/api/instances/:id/extend", { id }),
  instanceLock: (id: string) => path("/api/instances/:id/lock", { id }),
  instanceLogs: (id: string) => path("/api/instances/:id/logs", { id }),
  instancePublic: (id: string) => path("/api/instances/:id/public", { id }),
  instanceRename: (id: string) => path("/api/instances/:id/rename", { id }),
  instanceStream: (id: string) => path("/api/instances/:id/stream", { id }),
  instances: "/api/instances",
  userNotices: "/api/user/notices",
  userNoticeAck: (id: string) => path("/api/user/notices/:id/ack", { id }),
  webhook: (id: string) => path("/api/webhooks/:id", { id }),
  webhookTest: "/api/webhooks/test",
  webhooks: "/api/webhooks",
} as const;
