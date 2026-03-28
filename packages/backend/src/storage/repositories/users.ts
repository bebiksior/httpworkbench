import type { User, UserRecord } from "shared";
import { UserRecordSchema } from "shared";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../schema";

export function addUser(user: UserRecord): UserRecord {
  const parsed = UserRecordSchema.parse(user);
  getDb().insert(users).values(parsed).run();
  return parsed;
}

export function getUserByGoogleId(googleId: string): UserRecord | undefined {
  return getDb().select().from(users).where(eq(users.googleId, googleId)).get();
}

export function getUserById(id: string): UserRecord | undefined {
  return getDb().select().from(users).where(eq(users.id, id)).get();
}

export const toPublicUser = (user: UserRecord): User => ({
  id: user.id,
  googleId: user.googleId,
  createdAt: user.createdAt,
});
