import type { Phone, PhoneWake, Sms } from "shared";

export type ProviderPhone = Omit<Phone, "provider">;

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
  listPhones: () => Promise<ProviderPhone[]>;
  // Newest first.
  listSms: (phone: ProviderPhone, limit: number) => Promise<Sms[]>;
  setNotes: (phone: ProviderPhone, notes: string) => Promise<void>;
  wake: (phone: ProviderPhone) => Promise<PhoneWake>;
};
