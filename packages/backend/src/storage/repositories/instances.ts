import type { Instance } from "shared";
import { InstanceSchema } from "shared";
import { db } from "../db";

const isInstanceExpired = (instance: Instance, now: number) => {
  return instance.expiresAt !== undefined && instance.expiresAt <= now;
};

export async function addInstance(instance: Instance): Promise<Instance> {
  InstanceSchema.parse(instance);
  db.data.instances.push(instance);
  await db.write();
  return instance;
}

export async function getInstancesByOwner(
  ownerId: string,
): Promise<Instance[]> {
  const now = Date.now();
  return db.data.instances.filter(
    (i) => i.ownerId === ownerId && !isInstanceExpired(i, now),
  );
}

export async function getInstanceById(
  id: string,
): Promise<Instance | undefined> {
  const instance = db.data.instances.find((i) => i.id === id);
  if (instance === undefined) {
    return undefined;
  }
  return isInstanceExpired(instance, Date.now()) ? undefined : instance;
}

export async function updateInstance(
  id: string,
  updater: (instance: Instance) => Instance,
): Promise<Instance | undefined> {
  const index = db.data.instances.findIndex((i) => i.id === id);
  if (index === -1) {
    return undefined;
  }
  const current = db.data.instances[index];
  if (current === undefined) {
    return undefined;
  }
  if (isInstanceExpired(current, Date.now())) {
    return undefined;
  }

  const updated = updater(current);
  InstanceSchema.parse(updated);
  db.data.instances[index] = updated;
  await db.write();
  return updated;
}

export async function deleteInstance(id: string): Promise<void> {
  const index = db.data.instances.findIndex((i) => i.id === id);
  if (index === -1) {
    return;
  }
  db.data.instances.splice(index, 1);
  await db.write();
}

export async function removeExpiredInstances(now: number): Promise<string[]> {
  const removed: string[] = [];
  db.data.instances = db.data.instances.filter((instance) => {
    if (isInstanceExpired(instance, now)) {
      removed.push(instance.id);
      return false;
    }
    return true;
  });
  if (removed.length > 0) {
    await db.write();
  }
  return removed;
}
