import { existsSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  InstanceModerationSchema,
  InstanceSchema,
  LogSchema,
  UserNoticeSchema,
  UserRecordSchema,
  WebhookSchema,
} from "shared";
import z from "zod";

const LEGACY_DB_JSON_FILENAME = "db.json";
const LEGACY_DB_GZIP_FILENAME = "db.json.gz";

export const LegacyStorageDataSchema = z.object({
  users: z.array(UserRecordSchema),
  instances: z.array(InstanceSchema),
  logs: z.array(LogSchema),
  webhooks: z.array(WebhookSchema),
  instanceModerations: z.array(InstanceModerationSchema).default([]),
  userNotices: z.array(UserNoticeSchema).default([]),
});

export type LegacyStorageData = z.infer<typeof LegacyStorageDataSchema>;

export const resolveDataDir = (dataDir?: string) => {
  return dataDir ?? Bun.env.DATA_DIR ?? path.join(process.cwd(), "data");
};

export const resolveLegacyDbPath = (dataDir?: string) => {
  const resolvedDataDir = resolveDataDir(dataDir);
  const gzipPath = path.join(resolvedDataDir, LEGACY_DB_GZIP_FILENAME);
  if (existsSync(gzipPath)) {
    return gzipPath;
  }

  const jsonPath = path.join(resolvedDataDir, LEGACY_DB_JSON_FILENAME);
  if (existsSync(jsonPath)) {
    return jsonPath;
  }

  return undefined;
};

export const readLegacyStorageData = async (
  dataDir?: string,
): Promise<LegacyStorageData> => {
  const legacyDbPath = resolveLegacyDbPath(dataDir);
  if (legacyDbPath === undefined) {
    throw new Error("Legacy db.json or db.json.gz file not found");
  }

  const encoded = await Bun.file(legacyDbPath).text();
  const decoded = legacyDbPath.endsWith(".gz")
    ? gunzipSync(Buffer.from(encoded, "base64")).toString()
    : encoded;
  const parsed = LegacyStorageDataSchema.safeParse(JSON.parse(decoded));
  if (!parsed.success) {
    throw new Error(`Invalid legacy database format: ${parsed.error.message}`);
  }

  return parsed.data;
};
