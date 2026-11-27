import type { PhoneWake, Sms } from "shared";
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
const maxPages = 20;

type Link = { href?: string | null; method?: string | null };

type Page<T> = { data: T[]; links?: { next?: Link | null } };

type Rental = {
  id: string;
  number: string;
  state: string;
  alwaysOn: boolean;
};

type TextverifiedSms = {
  id: string;
  from?: string | null;
  to: string;
  createdAt: string;
  smsContent?: string | null;
  parsedCode?: string | null;
};

type WakeResponse = {
  isScheduled: boolean;
  usageWindowStart?: string | null;
  usageWindowEnd?: string | null;
};

type RentalKind = "renewable" | "nonrenewable";

const usableStates = new Set([
  "renewableActive",
  "renewableOverdue",
  "nonrenewableActive",
]);

export type TextverifiedOptions = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
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

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const createTextverifiedProvider = (
  credentials: { username: string; apiKey: string },
  options: TextverifiedOptions = {},
): PhoneProvider => {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const kinds = new Map<string, RentalKind>();
  let token: { value: string; expiresAt: number } | undefined;
  let pendingToken: Promise<string> | undefined;

  const send = async (
    method: "GET" | "POST",
    url: string,
    headers: Record<string, string>,
    body?: unknown,
  ) => {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response | undefined;
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
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        if (method === "GET" && attempt + 1 < maxAttempts) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new PhoneProviderError(
          `Textverified is unreachable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const retryable =
        response.status === 429 || (method === "GET" && response.status >= 500);
      if (retryable && attempt + 1 < maxAttempts) {
        await sleep(backoffMs(attempt));
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
    const body = (await response.json()) as {
      token?: string;
      expiresAt?: string;
      expiresIn?: number;
    };
    if (typeof body.token !== "string") {
      throw new PhoneProviderError("Textverified returned no token");
    }
    token = {
      value: body.token,
      expiresAt:
        toTimestamp(body.expiresAt) ?? now() + (body.expiresIn ?? 0) * 1000,
    };
    return token.value;
  };

  const bearer = async () => {
    if (token !== undefined && token.expiresAt - now() > tokenRefreshMarginMs) {
      return token.value;
    }
    pendingToken ??= authenticate().finally(() => {
      pendingToken = undefined;
    });
    return pendingToken;
  };

  const call = async <T>(
    method: "GET" | "POST",
    pathOrUrl: string,
    body?: unknown,
  ): Promise<T> => {
    const url = new URL(pathOrUrl, baseUrl);
    // Pagination and wake links come from the API; never send the token to
    // another host.
    if (url.origin !== baseUrl) {
      throw new PhoneProviderError("Textverified returned an unexpected link");
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await send(
        method,
        url.toString(),
        { Authorization: `Bearer ${await bearer()}` },
        body,
      );
      if (response.status === 401 && attempt === 0) {
        token = undefined;
        continue;
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
      const text = await response.text();
      try {
        return (text === "" ? undefined : JSON.parse(text)) as T;
      } catch {
        throw new PhoneProviderError("Textverified returned invalid JSON");
      }
    }
    throw new PhoneProviderError("Textverified rejected the session");
  };

  const listPages = async <T>(path: string, limit = Infinity) => {
    const items: T[] = [];
    let next: string | undefined = path;
    for (let page = 0; next !== undefined && page < maxPages; page += 1) {
      const body: Page<T> | undefined = await call<Page<T>>("GET", next);
      if (!Array.isArray(body?.data)) {
        throw new PhoneProviderError(
          "Textverified returned an unexpected page",
        );
      }
      items.push(...body.data);
      if (items.length >= limit) break;
      next = body.links?.next?.href ?? undefined;
    }
    return items;
  };

  const listRentals = async (kind: RentalKind) =>
    (await listPages<Rental>(`/api/pub/v2/reservations/rental/${kind}`)).map(
      (rental) => ({ ...rental, kind }),
    );

  const readNotes = async (id: string) => {
    const body = await call<{ userNotes?: string | null }>(
      "GET",
      `/api/pub/v2/reservations/rental/${encodeURIComponent(id)}/user-notes`,
    );
    const notes = body.userNotes?.trim();
    return notes === undefined || notes === "" ? undefined : notes;
  };

  return {
    capabilities: { wake: true, notes: true },

    listPhones: async () => {
      const rentals = (
        await Promise.all([
          listRentals("renewable"),
          listRentals("nonrenewable"),
        ])
      )
        .flat()
        .filter((rental) => usableStates.has(rental.state));
      return Promise.all(
        rentals.map(async (rental): Promise<ProviderPhone> => {
          kinds.set(rental.id, rental.kind);
          return {
            id: rental.id,
            number: toE164(rental.number),
            notes: await readNotes(rental.id),
            state: rental.state,
            alwaysOn: rental.alwaysOn,
          };
        }),
      );
    },

    listSms: async (phone, limit) => {
      const query = new URLSearchParams({ reservationId: phone.id });
      const messages = await listPages<TextverifiedSms>(
        `/api/pub/v2/sms?${query.toString()}`,
        limit,
      );
      return messages.slice(0, limit).map((sms): Sms => ({
        id: sms.id,
        from: sms.from ?? undefined,
        to: toE164(sms.to),
        timestamp: toTimestamp(sms.createdAt) ?? 0,
        text: sms.smsContent ?? "",
        parsedCode: sms.parsedCode ?? undefined,
      }));
    },

    setNotes: async (phone, notes) => {
      const kind = kinds.get(phone.id) ?? "renewable";
      await call(
        "POST",
        `/api/pub/v2/reservations/rental/${kind}/${encodeURIComponent(phone.id)}`,
        { userNotes: notes },
      );
    },

    wake: async (phone): Promise<PhoneWake> => {
      const link = await call<Link>("POST", "/api/pub/v2/wake-requests", {
        reservationId: phone.id,
      });
      if (typeof link?.href !== "string") {
        throw new PhoneProviderError("Textverified returned no wake request");
      }
      const wake = await call<WakeResponse>("GET", link.href);
      return {
        scheduled: wake.isScheduled,
        usageWindowStart: toTimestamp(wake.usageWindowStart),
        usageWindowEnd: toTimestamp(wake.usageWindowEnd),
      };
    },
  };
};
