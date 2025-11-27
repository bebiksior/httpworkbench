import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { Low } from "lowdb";
import { DataFile } from "lowdb/node";
import {
  InstanceSchema,
  LogSchema,
  UserRecordSchema,
  WebhookSchema,
} from "shared";
import z from "zod";

const DATA_DIR = Bun.env.DATA_DIR ?? path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DBDataSchema = z.object({
  users: z.array(UserRecordSchema),
  instances: z.array(InstanceSchema),
  logs: z.array(LogSchema),
  webhooks: z.array(WebhookSchema),
});

type DBData = z.infer<typeof DBDataSchema>;

const USE_COMPRESSION = Bun.env.NODE_ENV === "production";
const adapter = new DataFile<DBData>(
  path.join(DATA_DIR, USE_COMPRESSION ? "db.json.gz" : "db.json"),
  USE_COMPRESSION
    ? {
        parse: (data: string) =>
          JSON.parse(gunzipSync(Buffer.from(data, "base64")).toString()),
        stringify: (obj: DBData) =>
          gzipSync(JSON.stringify(obj)).toString("base64"),
      }
    : {
        parse: JSON.parse,
        stringify: JSON.stringify,
      },
);

export const db = new Low<DBData>(adapter, {
  users: [],
  instances: [],
  logs: [],
  webhooks: [],
});

export async function initDb() {
  await db.read();
  const parsed = DBDataSchema.safeParse(db.data);
  if (!parsed.success) {
    return {
      kind: "error",
      error: new Error(`Invalid db.json format: ${parsed.error.message}`),
    };
  }

  db.data = parsed.data;

  return {
    kind: "ok",
    stats: {
      instancesLength: db.data.instances.length,
      logsLength: db.data.logs.length,
      usersLength: db.data.users.length,
      webhooksLength: db.data.webhooks.length,
    },
  };
}
