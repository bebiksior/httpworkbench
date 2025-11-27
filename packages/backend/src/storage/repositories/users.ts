import type { User, UserRecord } from "shared";
import { UserRecordSchema } from "shared";
import { db } from "../db";

export async function addUser(user: UserRecord): Promise<UserRecord> {
  UserRecordSchema.parse(user);
  db.data.users.push(user);
  await db.write();
  return user;
}

export async function getUserByGoogleId(
  googleId: string,
): Promise<UserRecord | undefined> {
  const user = db.data.users.find((u) => u.googleId === googleId);
  return user;
}

export async function getUserById(id: string): Promise<UserRecord | undefined> {
  return db.data.users.find((u) => u.id === id);
}

export const toPublicUser = (user: UserRecord): User => ({
  id: user.id,
  googleId: user.googleId,
  createdAt: user.createdAt,
});
