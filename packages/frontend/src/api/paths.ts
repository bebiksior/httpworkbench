import { path } from "urlguard";

export const apiPaths = {
  aiChatGpt: "/api/ai/chatgpt",
  aiOAuthDevice: "/api/ai/oauth/device",
  aiOAuthPoll: "/api/ai/oauth/poll",
  aiOAuthRefresh: "/api/ai/oauth/refresh",
  apiKey: (id: string) => path("/api/api-keys/:id", { id }),
  apiKeys: "/api/api-keys",
  guestInstance: (id: string) => path("/api/guest/instances/:id", { id }),
  guestInstanceLogs: (id: string) =>
    path("/api/guest/instances/:id/logs", { id }),
  guestInstanceRecentLogs: (id: string, query = "") =>
    `${path("/api/guest/instances/:id/logs/recent", { id })}${query}`,
  guestInstanceLock: (id: string) =>
    path("/api/guest/instances/:id/lock", { id }),
  guestInstances: "/api/guest/instances",
  guestInstanceSummaries: "/api/guest/instances/list",
  instance: (id: string) => path("/api/instances/:id", { id }),
  instanceExtend: (id: string) => path("/api/instances/:id/extend", { id }),
  instanceLock: (id: string) => path("/api/instances/:id/lock", { id }),
  instanceLogs: (id: string) => path("/api/instances/:id/logs", { id }),
  instanceRecentLogs: (id: string, query = "") =>
    `${path("/api/instances/:id/logs/recent", { id })}${query}`,
  instancePublic: (id: string) => path("/api/instances/:id/public", { id }),
  instanceRename: (id: string) => path("/api/instances/:id/rename", { id }),
  instanceStream: (id: string) => path("/api/instances/:id/stream", { id }),
  instances: "/api/instances",
  mailbox: (id: string) => path("/api/mailboxes/:id", { id }),
  mailboxExtend: (id: string) => path("/api/mailboxes/:id/extend", { id }),
  mailboxMessage: (id: string, messageId: string) =>
    path("/api/mailboxes/:id/messages/:messageId", { id, messageId }),
  mailboxMessageAttachment: (id: string, messageId: string, index: number) =>
    path("/api/mailboxes/:id/messages/:messageId/attachments/:index", {
      id,
      messageId,
      index,
    }),
  mailboxMessageSource: (id: string, messageId: string) =>
    path("/api/mailboxes/:id/messages/:messageId/raw", { id, messageId }),
  mailboxMessages: (id: string) => path("/api/mailboxes/:id/messages", { id }),
  mailboxSend: (id: string) => path("/api/mailboxes/:id/send", { id }),
  mailboxes: "/api/mailboxes",
  userNotices: "/api/user/notices",
  userNoticesAck: "/api/user/notices/ack",
  webhook: (id: string) => path("/api/webhooks/:id", { id }),
  webhookTest: "/api/webhooks/test",
  webhooks: "/api/webhooks",
} as const;
