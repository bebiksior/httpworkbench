import type { PhoneProviderId } from "shared";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { phoneProviders } from "../schema";

export type PhoneProviderRecord = typeof phoneProviders.$inferSelect;

export const getPhoneProvidersByUser = (
  userId: string,
): PhoneProviderRecord[] =>
  getDb()
    .select()
    .from(phoneProviders)
    .where(eq(phoneProviders.userId, userId))
    .orderBy(asc(phoneProviders.createdAt))
    .all();

export const setPhoneProvider = (record: PhoneProviderRecord) => {
  getDb()
    .insert(phoneProviders)
    .values(record)
    .onConflictDoUpdate({
      target: [phoneProviders.userId, phoneProviders.provider],
      set: {
        credentialsCiphertext: record.credentialsCiphertext,
        createdAt: record.createdAt,
      },
    })
    .run();
  return record;
};

export const deletePhoneProvider = (
  userId: string,
  provider: PhoneProviderId,
): boolean =>
  getDb()
    .delete(phoneProviders)
    .where(
      and(
        eq(phoneProviders.userId, userId),
        eq(phoneProviders.provider, provider),
      ),
    )
    .returning({ userId: phoneProviders.userId })
    .all().length > 0;
