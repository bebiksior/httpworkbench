import { setTimeout as delay } from "node:timers/promises";
import {
  phoneProviders,
  type Phone,
  type PhoneProviderConfig,
  type PhoneProviderId,
  type PhoneWake,
  type SavePhoneProviderInput,
  type Sms,
} from "shared";
import {
  deletePhoneProvider,
  getPhoneProvidersByUser,
  setPhoneProvider,
  type PhoneProviderRecord,
} from "../../storage";
import { openSecret, sealSecret } from "../secretBox";
import {
  PhoneProviderError,
  type PhoneProvider,
  type SmsCursor,
} from "./provider";
import { createTextverifiedProvider } from "./textverified";

type PhoneServiceError = { message: string; status: number };

export type PhoneServiceResult<T> =
  { ok: true; value: T } | { ok: false; error: PhoneServiceError };

const fail = (message: string, status: number): PhoneServiceResult<never> => ({
  ok: false,
  error: { message, status },
});

const attempt = async <T>(
  run: () => Promise<T>,
): Promise<PhoneServiceResult<T>> => {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof PhoneProviderError) {
      return fail(error.message, error.status);
    }
    throw error;
  }
};

const noPhoneProviderMessage =
  "No phone provider configured. Add one in Settings → Phones.";

const phonesTtlMs = 30_000;
const smsPollIntervalMs = 3_000;
const maxCachedUsers = 1_000;

const factories: Record<
  PhoneProviderId,
  (credentials: Record<string, string>) => PhoneProvider
> = {
  textverified: (credentials) =>
    createTextverifiedProvider({
      username: credentials.username ?? "",
      apiKey: credentials.apiKey ?? "",
    }),
};

const secretContext = (userId: string, provider: PhoneProviderId) =>
  `phone-provider:${userId}:${provider}`;

const boundedSet = <V>(map: Map<string, V>, key: string, value: V) => {
  map.delete(key);
  map.set(key, value);
  if (map.size > maxCachedUsers) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
};

type PhoneCache = { at: number; values?: Phone[] };

type ProviderInstance = {
  sealed: string;
  provider: PhoneProvider;
  phones?: PhoneCache;
};

const providerInstances = new Map<string, ProviderInstance>();

const readCredentials = (record: PhoneProviderRecord) => {
  const plaintext = openSecret(
    record.credentialsCiphertext,
    secretContext(record.userId, record.provider),
  );
  return plaintext === undefined
    ? undefined
    : (JSON.parse(plaintext) as Record<string, string>);
};

const instanceFor = (record: PhoneProviderRecord): ProviderInstance => {
  const key = `${record.userId}:${record.provider}`;
  const cached = providerInstances.get(key);
  if (cached?.sealed === record.credentialsCiphertext) {
    return cached;
  }
  const credentials = readCredentials(record);
  if (credentials === undefined) {
    throw new PhoneProviderError(
      `Stored ${phoneProviders[record.provider].name} credentials can no longer be decrypted. Save them again in Settings → Phones.`,
      409,
    );
  }
  const instance = {
    sealed: record.credentialsCiphertext,
    provider: factories[record.provider](credentials),
  };
  boundedSet(providerInstances, key, instance);
  return instance;
};

const maskValue = (value: string) =>
  value.length > 4 ? `••••${value.slice(-4)}` : "••••";

const toConfig = (record: PhoneProviderRecord): PhoneProviderConfig => {
  const credentials = readCredentials(record) ?? {};
  return {
    provider: record.provider,
    credentials: Object.fromEntries(
      phoneProviders[record.provider].fields.map((field) => {
        const value = credentials[field.key] ?? "";
        return [field.key, field.secret ? maskValue(value) : value];
      }),
    ),
    createdAt: record.createdAt,
  };
};

export const listPhoneProviderConfigs = (
  userId: string,
): PhoneProviderConfig[] => getPhoneProvidersByUser(userId).map(toConfig);

const findRecord = (userId: string, provider: PhoneProviderId) =>
  getPhoneProvidersByUser(userId).find(
    (record) => record.provider === provider,
  );

const fieldsError = (input: SavePhoneProviderInput) => {
  const expected = phoneProviders[input.provider].fields.map(
    (field) => field.key,
  );
  const given = Object.keys(input.credentials);
  const missing = expected.filter((key) => !given.includes(key));
  const extra = given.filter((key) => !expected.includes(key));
  if (missing.length > 0) return `Missing ${missing.join(", ")}`;
  if (extra.length > 0) return `Unknown field ${extra.join(", ")}`;
  return undefined;
};

export const savePhoneProvider = async (
  userId: string,
  input: SavePhoneProviderInput,
): Promise<PhoneServiceResult<PhoneProviderConfig>> => {
  const invalid = fieldsError(input);
  if (invalid !== undefined) {
    return fail(invalid, 400);
  }
  const previous = findRecord(userId, input.provider);
  const record: PhoneProviderRecord = {
    userId,
    provider: input.provider,
    credentialsCiphertext: sealSecret(
      JSON.stringify(input.credentials),
      secretContext(userId, input.provider),
    ),
    createdAt: Date.now(),
  };
  const provider = factories[input.provider](input.credentials);
  const verified = await attempt(() => provider.listPhones());
  if (!verified.ok) {
    return verified;
  }
  if (!setPhoneProvider(record, previous?.credentialsCiphertext)) {
    return fail(
      "Phone provider configuration changed while verifying credentials. Try again.",
      409,
    );
  }
  boundedSet(providerInstances, `${userId}:${input.provider}`, {
    sealed: record.credentialsCiphertext,
    provider,
  });
  return { ok: true, value: toConfig(record) };
};

export const testPhoneProvider = async (
  userId: string,
  providerId: PhoneProviderId,
): Promise<PhoneServiceResult<{ phoneCount: number }>> => {
  const record = findRecord(userId, providerId);
  if (record === undefined) {
    return fail("Phone provider not configured", 404);
  }
  providerInstances.delete(`${userId}:${providerId}`);
  return attempt(async () => ({
    phoneCount: (await fetchPhones(record, instanceFor(record))).length,
  }));
};

export const removePhoneProvider = (
  userId: string,
  providerId: PhoneProviderId,
): boolean => {
  const deleted = deletePhoneProvider(userId, providerId);
  providerInstances.delete(`${userId}:${providerId}`);
  return deleted;
};

const configuredRecords = (userId: string) => {
  const records = getPhoneProvidersByUser(userId);
  if (records.length === 0) {
    throw new PhoneProviderError(noPhoneProviderMessage, 409);
  }
  return records;
};

const cachedPhones = (instance: ProviderInstance) => {
  const cached = instance.phones;
  return cached !== undefined && Date.now() - cached.at < phonesTtlMs
    ? cached.values
    : undefined;
};

const fetchPhones = async (
  record: PhoneProviderRecord,
  instance: ProviderInstance,
  signal?: AbortSignal,
) => {
  const cache: PhoneCache = { at: Date.now() };
  instance.phones = cache;
  const phones = await instance.provider.listPhones(signal);
  cache.values = phones.map((phone) => ({
    ...phone,
    provider: record.provider,
  }));
  return cache.values;
};

export const listUserPhones = (
  userId: string,
): Promise<PhoneServiceResult<Phone[]>> =>
  attempt(async () => {
    const lists = await Promise.all(
      configuredRecords(userId).map((record) => {
        const instance = instanceFor(record);
        return cachedPhones(instance) ?? fetchPhones(record, instance);
      }),
    );
    return lists.flat();
  });

const resolvePhone = async (
  userId: string,
  phoneId: string,
  signal?: AbortSignal,
) => {
  for (const record of configuredRecords(userId)) {
    const instance = instanceFor(record);
    const match = (phone: Phone) => phone.id === phoneId;
    const phone =
      cachedPhones(instance)?.find(match) ??
      (await fetchPhones(record, instance, signal)).find(match);
    if (phone !== undefined) return { phone, instance };
  }
  throw new PhoneProviderError("Phone not found", 404);
};

export const getUserPhone = (
  userId: string,
  phoneId: string,
): Promise<PhoneServiceResult<Phone>> =>
  attempt(async () => (await resolvePhone(userId, phoneId)).phone);

const readSms = async (
  userId: string,
  phoneId: string,
  limit: number,
  after?: SmsCursor,
  signal?: AbortSignal,
): Promise<Sms[]> => {
  const { phone, instance } = await resolvePhone(userId, phoneId, signal);
  return instance.provider.listSms(phone, limit, after, signal);
};

export const listPhoneSms = (
  userId: string,
  phoneId: string,
  limit: number,
): Promise<PhoneServiceResult<Sms[]>> =>
  attempt(() => readSms(userId, phoneId, limit));

export const updatePhoneNotes = (
  userId: string,
  phoneId: string,
  notes: string,
): Promise<PhoneServiceResult<Phone>> =>
  attempt(async () => {
    const { phone, instance } = await resolvePhone(userId, phoneId);
    if (!instance.provider.capabilities.notes) {
      throw new PhoneProviderError(
        `${phoneProviders[phone.provider].name} does not support notes`,
        400,
      );
    }
    await instance.provider.setNotes(phone, notes);
    instance.phones = undefined;
    return { ...phone, notes: notes === "" ? undefined : notes };
  });

export const wakeUserPhone = (
  userId: string,
  phoneId: string,
): Promise<PhoneServiceResult<PhoneWake>> =>
  attempt(async () => {
    const { phone, instance } = await resolvePhone(userId, phoneId);
    if (phone.alwaysOn) {
      throw new PhoneProviderError(
        "This line is always on and needs no wake",
        400,
      );
    }
    if (!instance.provider.capabilities.wake) {
      throw new PhoneProviderError(
        `${phoneProviders[phone.provider].name} cannot wake lines`,
        400,
      );
    }
    return instance.provider.wake(phone);
  });

export type { SmsCursor } from "./provider";

const latestCursor = (messages: Sms[]): SmsCursor => {
  const [latest] = messages;
  return latest === undefined
    ? { at: 0, id: "" }
    : { at: latest.timestamp, id: latest.id };
};

export const watchPhoneSms = (
  userId: string,
  phoneId: string,
  options: { cursor?: SmsCursor; timeoutMs: number; signal: AbortSignal },
): Promise<PhoneServiceResult<{ messages: Sms[]; cursor: SmsCursor }>> =>
  attempt(async () => {
    const signal = AbortSignal.any([
      options.signal,
      AbortSignal.timeout(options.timeoutMs),
    ]);
    let cursor = options.cursor;
    let fresh: Sms[] = [];
    try {
      if (cursor === undefined) {
        cursor = latestCursor(
          await readSms(userId, phoneId, 1, undefined, signal),
        );
      } else {
        fresh = await readSms(userId, phoneId, 20, cursor, signal);
      }
      while (fresh.length === 0) {
        await delay(smsPollIntervalMs, undefined, { signal });
        fresh = await readSms(userId, phoneId, 20, cursor, signal);
      }
    } catch (error) {
      if (!signal.aborted) throw error;
      if (cursor === undefined)
        throw new PhoneProviderError(
          "Could not start the SMS watch in time",
          504,
        );
    }
    const newest = fresh[0];
    return {
      messages: fresh.reverse(),
      cursor:
        newest === undefined ? cursor : { at: newest.timestamp, id: newest.id },
    };
  });
