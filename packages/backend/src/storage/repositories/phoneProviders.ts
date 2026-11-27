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

export const setPhoneProvider = (
  record: PhoneProviderRecord,
  previousCiphertext: string | undefined,
): boolean => {
  if (previousCiphertext === undefined) {
    return (
      getDb()
        .insert(phoneProviders)
        .values(record)
        .onConflictDoNothing()
        .returning({ provider: phoneProviders.provider })
        .get() !== undefined
    );
  }
  return (
    getDb()
      .update(phoneProviders)
      .set({
        credentialsCiphertext: record.credentialsCiphertext,
        createdAt: record.createdAt,
      })
      .where(
        and(
          eq(phoneProviders.userId, record.userId),
          eq(phoneProviders.provider, record.provider),
          eq(phoneProviders.credentialsCiphertext, previousCiphertext),
        ),
      )
      .returning({ provider: phoneProviders.provider })
      .get() !== undefined
  );
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
