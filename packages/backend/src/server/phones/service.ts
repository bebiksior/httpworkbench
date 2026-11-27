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
  type ProviderPhone,
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
const smsTtlMs = 2_000;
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

const providerInstances = new Map<
  string,
  { sealed: string; provider: PhoneProvider }
>();
const phonesCache = new Map<string, { at: number; phones: Phone[] }>();
const smsCache = new Map<string, { at: number; messages: Promise<Sms[]> }>();

const readCredentials = (record: PhoneProviderRecord) => {
  const plaintext = openSecret(
    record.credentialsCiphertext,
    secretContext(record.userId, record.provider),
  );
  return plaintext === undefined
    ? undefined
    : (JSON.parse(plaintext) as Record<string, string>);
};

const instanceFor = (record: PhoneProviderRecord): PhoneProvider => {
  const key = `${record.userId}:${record.provider}`;
  const cached = providerInstances.get(key);
  if (cached?.sealed === record.credentialsCiphertext) {
    return cached.provider;
  }
  const credentials = readCredentials(record);
  if (credentials === undefined) {
    throw new PhoneProviderError(
      `Stored ${phoneProviders[record.provider].name} credentials can no longer be decrypted. Save them again in Settings → Phones.`,
      409,
    );
  }
  const provider = factories[record.provider](credentials);
  boundedSet(providerInstances, key, {
    sealed: record.credentialsCiphertext,
    provider,
  });
  return provider;
};

const forgetUser = (userId: string) => {
  phonesCache.delete(userId);
  for (const key of [...providerInstances.keys(), ...smsCache.keys()]) {
    if (key.startsWith(`${userId}:`)) {
      providerInstances.delete(key);
      smsCache.delete(key);
    }
  }
};

const maskValue = (value: string) => `••••${value.slice(-4)}`;

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
  setPhoneProvider(record);
  forgetUser(userId);
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
  phonesCache.delete(userId);
  return attempt(async () => ({
    phoneCount: (await instanceFor(record).listPhones()).length,
  }));
};

export const removePhoneProvider = (
  userId: string,
  providerId: PhoneProviderId,
): boolean => {
  const deleted = deletePhoneProvider(userId, providerId);
  forgetUser(userId);
  return deleted;
};

const loadPhones = async (userId: string, fresh: boolean) => {
  const cached = phonesCache.get(userId);
  if (!fresh && cached !== undefined && Date.now() - cached.at < phonesTtlMs) {
    return cached.phones;
  }
  const records = getPhoneProvidersByUser(userId);
  if (records.length === 0) {
    throw new PhoneProviderError(noPhoneProviderMessage, 409);
  }
  const phones = (
    await Promise.all(
      records.map(async (record) =>
        (await instanceFor(record).listPhones()).map((phone): Phone => ({
          ...phone,
          provider: record.provider,
        })),
      ),
    )
  ).flat();
  boundedSet(phonesCache, userId, { at: Date.now(), phones });
  return phones;
};

export const listUserPhones = (
  userId: string,
): Promise<PhoneServiceResult<Phone[]>> =>
  attempt(() => loadPhones(userId, false));

const resolvePhone = async (userId: string, phoneId: string) => {
  const find = (phones: Phone[]) =>
    phones.find((phone) => phone.id === phoneId);
  const phone =
    find(await loadPhones(userId, false)) ??
    find(await loadPhones(userId, true));
  const record =
    phone === undefined ? undefined : findRecord(userId, phone.provider);
  if (phone === undefined || record === undefined) {
    throw new PhoneProviderError("Phone not found", 404);
  }
  const { provider: _provider, ...providerPhone } = phone;
  return {
    phone,
    providerPhone: providerPhone satisfies ProviderPhone,
    provider: instanceFor(record),
  };
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
): Promise<Sms[]> => {
  const { provider, providerPhone } = await resolvePhone(userId, phoneId);
  const key = `${userId}:${phoneId}:${limit}`;
  const cached = smsCache.get(key);
  if (cached !== undefined && Date.now() - cached.at < smsTtlMs) {
    return cached.messages;
  }
  const messages = provider.listSms(providerPhone, limit);
  boundedSet(smsCache, key, { at: Date.now(), messages });
  messages.catch(() => smsCache.delete(key));
  return messages;
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
    const { phone, provider, providerPhone } = await resolvePhone(
      userId,
      phoneId,
    );
    if (!provider.capabilities.notes) {
      throw new PhoneProviderError(
        `${phoneProviders[phone.provider].name} does not support notes`,
        400,
      );
    }
    await provider.setNotes(providerPhone, notes);
    phonesCache.delete(userId);
    return { ...phone, notes: notes === "" ? undefined : notes };
  });

export const wakeUserPhone = (
  userId: string,
  phoneId: string,
): Promise<PhoneServiceResult<PhoneWake>> =>
  attempt(async () => {
    const { phone, provider, providerPhone } = await resolvePhone(
      userId,
      phoneId,
    );
    if (phone.alwaysOn) {
      throw new PhoneProviderError(
        "This line is always on and needs no wake",
        400,
      );
    }
    if (!provider.capabilities.wake) {
      throw new PhoneProviderError(
        `${phoneProviders[phone.provider].name} cannot wake lines`,
        400,
      );
    }
    return provider.wake(providerPhone);
  });

export type SmsCursor = { at: number; id: string };

const newerThan = (messages: Sms[], cursor: SmsCursor) => {
  const index = messages.findIndex((message) => message.id === cursor.id);
  return (
    index === -1
      ? messages.filter((message) => message.timestamp > cursor.at)
      : messages.slice(0, index)
  ).reverse();
};

const latestCursor = (messages: Sms[]): SmsCursor => {
  const [latest] = messages;
  return latest === undefined
    ? { at: 0, id: "" }
    : { at: latest.timestamp, id: latest.id };
};

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timeout = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });

export const watchPhoneSms = (
  userId: string,
  phoneId: string,
  options: { cursor?: SmsCursor; timeoutMs: number; signal: AbortSignal },
): Promise<PhoneServiceResult<{ messages: Sms[]; cursor: SmsCursor }>> =>
  attempt(async () => {
    const deadline = Date.now() + options.timeoutMs;
    const first = await readSms(userId, phoneId, 20);
    const cursor = options.cursor ?? latestCursor(first);
    let fresh = newerThan(first, cursor);
    while (
      fresh.length === 0 &&
      !options.signal.aborted &&
      Date.now() + smsPollIntervalMs < deadline
    ) {
      await pause(smsPollIntervalMs, options.signal);
      if (options.signal.aborted) break;
      fresh = newerThan(await readSms(userId, phoneId, 20), cursor);
    }
    const newest = fresh.at(-1);
    return {
      messages: fresh,
      cursor:
        newest === undefined ? cursor : { at: newest.timestamp, id: newest.id },
    };
  });
