import type { Instance, Log, Processor, UserNotice } from "shared";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    googleId: text("googleId").notNull(),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("users_googleId_unique").on(table.googleId)],
);

export const instances = sqliteTable(
  "instances",
  {
    id: text("id").primaryKey(),
    ownerId: text("ownerId").notNull(),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
    expiresAt: integer("expiresAt", { mode: "number" }),
    label: text("label"),
    isPublic: integer("isPublic", { mode: "boolean" }).notNull(),
    isLocked: integer("isLocked", { mode: "boolean" }).notNull(),
    kind: text("kind", { enum: ["static", "dynamic"] })
      .$type<Instance["kind"]>()
      .notNull(),
    raw: text("raw"),
    processorsJson: text("processorsJson", { mode: "json" }).$type<
      Processor[] | null
    >(),
  },
  (table) => [
    index("instances_by_owner").on(table.ownerId),
    index("instances_by_expiration").on(table.expiresAt),
  ],
);

export const webhooks = sqliteTable(
  "webhooks",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    ownerId: text("ownerId").notNull(),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
  },
  (table) => [index("webhooks_by_owner").on(table.ownerId)],
);

export const instanceWebhooks = sqliteTable(
  "instanceWebhooks",
  {
    instanceId: text("instanceId")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    webhookId: text("webhookId")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    position: integer("position", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.instanceId, table.position] }),
    uniqueIndex("instanceWebhooks_instance_webhook_unique").on(
      table.instanceId,
      table.webhookId,
    ),
    index("instanceWebhooks_by_instance").on(table.instanceId, table.position),
  ],
);

export const logs = sqliteTable(
  "logs",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    id: text("id").notNull(),
    instanceId: text("instanceId")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["dns", "http"] })
      .$type<Log["type"]>()
      .notNull(),
    timestamp: integer("timestamp", { mode: "number" }).notNull(),
    address: text("address").notNull(),
    raw: text("raw").notNull(),
  },
  (table) => [
    uniqueIndex("logs_id_unique").on(table.id),
    index("logs_by_instance_timestamp_id").on(
      table.instanceId,
      table.timestamp,
      table.id,
    ),
    index("logs_by_instance_seq").on(table.instanceId, table.seq),
  ],
);

export const instanceModerations = sqliteTable("instanceModerations", {
  instanceId: text("instanceId")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  window5mStartMs: integer("window5mStartMs", { mode: "number" }).notNull(),
  requestsInWindow5m: integer("requestsInWindow5m", {
    mode: "number",
  }).notNull(),
  strikeCommittedForWindow: integer("strikeCommittedForWindow", {
    mode: "boolean",
  }).notNull(),
  strikeTimestampsJson: text("strikeTimestampsJson", { mode: "json" })
    .$type<number[]>()
    .notNull(),
  discordMutedUntilMs: integer("discordMutedUntilMs", { mode: "number" }),
  window15mStartMs: integer("window15mStartMs", { mode: "number" }).notNull(),
  requestsInWindow15m: integer("requestsInWindow15m", {
    mode: "number",
  }).notNull(),
  lastMinuteBucketStartMs: integer("lastMinuteBucketStartMs", {
    mode: "number",
  }).notNull(),
  requestsInCurrentMinute: integer("requestsInCurrentMinute", {
    mode: "number",
  }).notNull(),
});

export const userNotices = sqliteTable(
  "userNotices",
  {
    id: text("id").primaryKey(),
    userId: text("userId").notNull(),
    kind: text("kind", { enum: ["instance_removed_noise"] })
      .$type<UserNotice["kind"]>()
      .notNull(),
    instanceId: text("instanceId").notNull(),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
    acknowledgedAt: integer("acknowledgedAt", { mode: "number" }),
  },
  (table) => [
    index("userNotices_by_user_createdAt").on(table.userId, table.createdAt),
  ],
);

export const schema = {
  users,
  instances,
  webhooks,
  instanceWebhooks,
  logs,
  instanceModerations,
  userNotices,
};
