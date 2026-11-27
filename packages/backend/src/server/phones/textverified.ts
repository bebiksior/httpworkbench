import { setTimeout as delay } from "node:timers/promises";
import type { PhoneWake, Sms } from "shared";
import { z } from "zod";
import { version } from "../../version";
import {
  PhoneProviderError,
  type PhoneProvider,
  type ProviderPhone,
} from "./provider";

const baseUrl = "https://www.textverified.com";
// Cloudflare in front of the API rejects bare clients, notably bodyless POSTs
// without Content-Length, so every request names this client explicitly.
const userAgent = `httpworkbench/${version}`;
const tokenRefreshMarginMs = 60_000;
const maxAttempts = 4;
const linkSchema = z.object({ href: z.string().nullish() });
const rentalSchema = z.object({
  id: z.string(),
  number: z.string(),
  state: z.string(),
  alwaysOn: z.boolean(),
});
const smsSchema = z.object({
  id: z.string(),
  from: z.string().nullish(),
  to: z.string(),
  createdAt: z.string(),
  smsContent: z.string().nullish(),
  parsedCode: z.string().nullish(),
});
const tokenSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().nullish(),
  expiresIn: z.number().nullish(),
});
const notesSchema = z.object({ userNotes: z.string().nullish() });
const wakeSchema = z.object({
  isScheduled: z.boolean(),
  usageWindowStart: z.string().nullish(),
  usageWindowEnd: z.string().nullish(),
});

const readJson = async <T>(
  response: Response,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) => {
  try {
    return schema.parse(await response.json());
  } catch {
    signal?.throwIfAborted();
    throw new PhoneProviderError("Textverified returned an invalid response");
  }
};

const providerUrl = (link: string, relativeTo = baseUrl) => {
  const url = URL.parse(link, relativeTo);
  if (url?.origin !== baseUrl || url.username || url.password) {
    throw new PhoneProviderError("Textverified returned an unexpected link");
  }
  return url.href;
};

type RentalKind = "renewable" | "nonrenewable";

const usableStates = new Set([
  "renewableActive",
  "renewableOverdue",
  "nonrenewableActive",
]);

export type TextverifiedOptions = {
  fetch?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
};

const toE164 = (number: string) => {
  const digits = number.replace(/\D/g, "");
  if (number.trim().startsWith("+")) return `+${digits}`;
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
};

const toTimestamp = (value: string | null | undefined) => {
  if (value === null || value === undefined) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const backoffMs = (attempt: number) =>
  500 * 2 ** attempt + Math.floor(Math.random() * 250);

const defaultSleep = async (ms: number, signal?: AbortSignal) => {
  try {
    await delay(ms, undefined, { signal });
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  }
};

export const createTextverifiedProvider = (
  credentials: { username: string; apiKey: string },
  options: TextverifiedOptions = {},
): PhoneProvider => {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  let token: { value: string; expiresAt: number } | undefined;
  let pendingToken: Promise<string> | undefined;

  const send = async (
    method: "GET" | "POST",
    url: string,
    headers: Record<string, string>,
    body?: unknown,
    signal?: AbortSignal,
  ) => {
    for (let attempt = 0; ; attempt += 1) {
      signal?.throwIfAborted();
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            "User-Agent": userAgent,
            Accept: "application/json",
            ...(body === undefined
              ? method === "POST"
                ? { "Content-Length": "0" }
                : {}
              : { "Content-Type": "application/json" }),
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
            : AbortSignal.timeout(15_000),
          redirect: "manual",
        });
      } catch {
        signal?.throwIfAborted();
        if (method === "GET" && attempt + 1 < maxAttempts) {
          await sleep(backoffMs(attempt), signal);
          continue;
        }
        throw new PhoneProviderError("Textverified is unreachable");
      }
      const retryable =
        method === "GET" && (response.status === 429 || response.status >= 500);
      if (retryable && attempt + 1 < maxAttempts) {
        await response.body?.cancel();
        await sleep(backoffMs(attempt), signal);
        continue;
      }
      return response;
    }
  };

  const authenticate = async () => {
    const response = await send("POST", `${baseUrl}/api/pub/v2/auth`, {
      "X-API-USERNAME": credentials.username,
      "X-API-KEY": credentials.apiKey,
    });
    if (response.status === 401 || response.status === 403) {
      throw new PhoneProviderError(
        "Textverified rejected the username or API key",
        400,
      );
    }
    if (!response.ok) {
      throw new PhoneProviderError(
        `Textverified sign-in failed with HTTP ${response.status}`,
      );
    }
    const body = await readJson(response, tokenSchema);
    token = {
      value: body.token,
      expiresAt:
        toTimestamp(body.expiresAt) ?? now() + (body.expiresIn ?? 0) * 1000,
    };
    return token.value;
  };

  const bearer = async (signal?: AbortSignal) => {
    if (token !== undefined && token.expiresAt - now() > tokenRefreshMarginMs) {
      return token.value;
    }
    pendingToken ??= authenticate().finally(() => {
      pendingToken = undefined;
    });
    if (signal === undefined) return pendingToken;
    const aborted = Promise.withResolvers<never>();
    const onAbort = () => aborted.reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await Promise.race([pendingToken, aborted.promise]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  };

  const call = async (
    method: "GET" | "POST",
    pathOrUrl: string,
    body?: unknown,
    signal?: AbortSignal,
  ) => {
    const url = providerUrl(pathOrUrl);
    for (let attempt = 0; ; attempt += 1) {
      signal?.throwIfAborted();
      const session = await bearer(signal);
      const response = await send(
        method,
        url,
        { Authorization: `Bearer ${session}` },
        body,
        signal,
      );
      if (response.status === 401) {
        if (token?.value === session) token = undefined;
        if (method === "GET" && attempt === 0) {
          await response.body?.cancel();
          continue;
        }
      }
      if (response.status === 404) {
        throw new PhoneProviderError(
          "Textverified could not find that line",
          404,
        );
      }
      if (!response.ok) {
        throw new PhoneProviderError(
          `Textverified request failed with HTTP ${response.status}`,
        );
      }
      return response;
    }
  };

  async function* pages<T>(
    path: string,
    itemSchema: z.ZodType<T>,
    signal?: AbortSignal,
  ) {
    const schema = z.object({
      data: z.array(itemSchema),
      hasNext: z.boolean().optional(),
      links: z.object({ next: linkSchema.nullish() }).optional(),
    });
    const visited = new Set<string>();
    let url = providerUrl(path);
    for (;;) {
      if (visited.has(url)) {
        throw new PhoneProviderError("Textverified returned a repeated page");
      }
      visited.add(url);
      const page = await readJson(
        await call("GET", url, undefined, signal),
        schema,
        signal,
      );
      yield page.data;
      const next = page.links?.next?.href;
      if (page.hasNext === false) return;
      if (next == null || next === "") {
        if (page.hasNext)
          throw new PhoneProviderError("Textverified returned no next page");
        return;
      }
      url = providerUrl(next, url);
    }
  }

  const listRentals = async (kind: RentalKind, signal?: AbortSignal) => {
    const phones: ProviderPhone[] = [];
    for await (const rentals of pages(
      `/api/pub/v2/reservations/rental/${kind}`,
      rentalSchema,
      signal,
    )) {
      const active = rentals.filter((rental) => usableStates.has(rental.state));
      phones.push(
        ...(await Promise.all(
          active.map(async (rental) => ({
            id: rental.id,
            number: toE164(rental.number),
            notes: await readNotes(rental.id, signal),
            state: rental.state,
            alwaysOn: rental.alwaysOn,
          })),
        )),
      );
    }
    return phones;
  };

  const readNotes = async (id: string, signal?: AbortSignal) => {
    const response = await call(
      "GET",
      `/api/pub/v2/reservations/rental/${encodeURIComponent(id)}/user-notes`,
      undefined,
      signal,
    );
    const body = await readJson(response, notesSchema, signal);
    const notes = body.userNotes?.trim();
    return notes === undefined || notes === "" ? undefined : notes;
  };

  return {
    capabilities: { wake: true, notes: true },

    listPhones: async (signal) =>
      (
        await Promise.all([
          listRentals("renewable", signal),
          listRentals("nonrenewable", signal),
        ])
      ).flat(),

    listSms: async (phone, limit, after, signal) => {
      const query = new URLSearchParams({ reservationId: phone.id });
      const messages: Sms[] = [];
      for await (const page of pages(
        `/api/pub/v2/sms?${query}`,
        smsSchema,
        signal,
      )) {
        for (const sms of page) {
          const timestamp = toTimestamp(sms.createdAt);
          if (timestamp === undefined) {
            throw new PhoneProviderError(
              "Textverified returned an invalid SMS timestamp",
            );
          }
          if (
            after !== undefined &&
            (sms.id === after.id || timestamp < after.at)
          ) {
            return messages.slice(-limit);
          }
          messages.push({
            id: sms.id,
            from: sms.from ?? undefined,
            to: toE164(sms.to),
            timestamp,
            text: sms.smsContent ?? "",
            parsedCode: sms.parsedCode ?? undefined,
          });
          if (after === undefined && messages.length === limit) return messages;
        }
        if (messages.length > limit)
          messages.splice(0, messages.length - limit);
      }
      return messages.slice(-limit);
    },

    setNotes: async (phone, notes) => {
      const kind =
        phone.state === "nonrenewableActive" ? "nonrenewable" : "renewable";
      const response = await call(
        "POST",
        `/api/pub/v2/reservations/rental/${kind}/${encodeURIComponent(phone.id)}`,
        { userNotes: notes },
      );
      await response.body?.cancel();
    },

    wake: async (phone): Promise<PhoneWake> => {
      const response = await call("POST", "/api/pub/v2/wake-requests", {
        reservationId: phone.id,
      });
      const link = await readJson(response, linkSchema);
      if (link.href == null || link.href === "") {
        throw new PhoneProviderError("Textverified returned no wake request");
      }
      const wake = await readJson(await call("GET", link.href), wakeSchema);
      return {
        scheduled: wake.isScheduled,
        usageWindowStart: toTimestamp(wake.usageWindowStart),
        usageWindowEnd: toTimestamp(wake.usageWindowEnd),
      };
    },
  };
};
