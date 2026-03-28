import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { Low } from "lowdb";
import { DataFile } from "lowdb/node";
import {
  InstanceModerationSchema,
  InstanceSchema,
  LogSchema,
  UserNoticeSchema,
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
  instanceModerations: z.array(InstanceModerationSchema).default([]),
  userNotices: z.array(UserNoticeSchema).default([]),
});

type DBData = z.infer<typeof DBDataSchema>;
const LOG_WRITE_DEBOUNCE_MS = 250;

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
  instanceModerations: [],
  userNotices: [],
});

let scheduledWriteTimeout: ReturnType<typeof setTimeout> | undefined;
let writeRequested = false;
let writeInFlight: Promise<void> | undefined;

const runScheduledWrite = () => {
  if (!writeRequested || writeInFlight !== undefined) {
    return;
  }

  writeRequested = false;
  writeInFlight = db.write().finally(() => {
    writeInFlight = undefined;
    if (writeRequested) {
      scheduleDbWrite(0);
    }
  });
};

export function scheduleDbWrite(delayMs = LOG_WRITE_DEBOUNCE_MS): void {
  writeRequested = true;
  if (scheduledWriteTimeout !== undefined || writeInFlight !== undefined) {
    return;
  }
  if (delayMs === 0) {
    runScheduledWrite();
    return;
  }
  scheduledWriteTimeout = setTimeout(() => {
    scheduledWriteTimeout = undefined;
    runScheduledWrite();
  }, delayMs);
}

export async function flushScheduledDbWrite(): Promise<void> {
  if (scheduledWriteTimeout !== undefined) {
    clearTimeout(scheduledWriteTimeout);
    scheduledWriteTimeout = undefined;
    runScheduledWrite();
  } else if (writeRequested && writeInFlight === undefined) {
    runScheduledWrite();
  }

  if (writeInFlight !== undefined) {
    await writeInFlight;
  }

  if (writeRequested || scheduledWriteTimeout !== undefined) {
    await flushScheduledDbWrite();
  }
}

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
