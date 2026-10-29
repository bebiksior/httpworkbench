import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { localCredentials, users } from "../schema";

export const getLocalCredentialsByUsername = (username: string) =>
  getDb()
    .select()
    .from(localCredentials)
    .where(eq(localCredentials.username, username))
    .get();

export const getLocalCredentialsByUserId = (userId: string) =>
  getDb()
    .select()
    .from(localCredentials)
    .where(eq(localCredentials.userId, userId))
    .get();

export const setLocalPassword = (username: string, passwordHash: string) =>
  getDb().transaction((tx) => {
    const current = tx
      .select()
      .from(localCredentials)
      .where(eq(localCredentials.username, username))
      .get();
    if (current !== undefined) {
      return tx
        .update(localCredentials)
        .set({ passwordHash, revision: current.revision + 1 })
        .where(eq(localCredentials.userId, current.userId))
        .returning()
        .get();
    }

    const userId = crypto.randomUUID();
    tx.insert(users)
      .values({ id: userId, googleId: null, createdAt: Date.now() })
      .run();
    return tx
      .insert(localCredentials)
      .values({ userId, username, passwordHash, revision: 1 })
      .returning()
      .get();
  });
