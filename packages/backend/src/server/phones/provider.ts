import type { Phone, PhoneWake, Sms } from "shared";

export type ProviderPhone = Omit<Phone, "provider">;

export type SmsCursor = { at: number; id: string };

export class PhoneProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "PhoneProviderError";
  }
}

export type PhoneProvider = {
  capabilities: { wake: boolean; notes: boolean };
  listPhones: (signal?: AbortSignal) => Promise<ProviderPhone[]>;
  // Newest first. With a cursor, return the first batch after it.
  listSms: (
    phone: ProviderPhone,
    limit: number,
    after?: SmsCursor,
    signal?: AbortSignal,
  ) => Promise<Sms[]>;
  setNotes: (phone: ProviderPhone, notes: string) => Promise<void>;
  wake: (phone: ProviderPhone) => Promise<PhoneWake>;
};
