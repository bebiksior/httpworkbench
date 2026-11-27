import { z } from "zod";

export const PhoneProviderIdSchema = z.enum(["textverified"]);

export type PhoneProviderId = z.infer<typeof PhoneProviderIdSchema>;

type PhoneProviderField = {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
};

export const phoneProviders: Record<
  PhoneProviderId,
  { name: string; url: string; fields: PhoneProviderField[] }
> = {
  textverified: {
    name: "Textverified",
    url: "https://www.textverified.com/app/api/configure",
    fields: [
      {
        key: "username",
        label: "Username",
        secret: false,
        placeholder: "Account email",
      },
      { key: "apiKey", label: "API key", secret: true },
    ],
  },
};

export const SavePhoneProviderSchema = z
  .object({
    provider: PhoneProviderIdSchema,
    credentials: z.record(z.string(), z.string().trim().min(1).max(512)),
  })
  .strict();

export type SavePhoneProviderInput = z.infer<typeof SavePhoneProviderSchema>;

export const PhoneProviderConfigSchema = z.object({
  provider: PhoneProviderIdSchema,
  credentials: z
    .record(z.string(), z.string())
    .describe("Credential fields, with secret values masked."),
  createdAt: z.number(),
});

export type PhoneProviderConfig = z.infer<typeof PhoneProviderConfigSchema>;

export const PhoneProviderConfigsResponseSchema = z.array(
  PhoneProviderConfigSchema,
);

export const PhoneProviderTestResultSchema = z.object({
  phoneCount: z.number().int().nonnegative(),
});

export type PhoneProviderTestResult = z.infer<
  typeof PhoneProviderTestResultSchema
>;

export const PhoneSchema = z.object({
  id: z.string(),
  provider: PhoneProviderIdSchema,
  number: z.string().describe("E.164, e.g. +13305550100"),
  notes: z.string().optional(),
  state: z.string(),
  alwaysOn: z
    .boolean()
    .describe("False when the line must be woken before it receives SMS."),
});

export type Phone = z.infer<typeof PhoneSchema>;

export const PhonesResponseSchema = z.array(PhoneSchema);

export const SmsSchema = z.object({
  id: z.string(),
  from: z.string().optional(),
  to: z.string(),
  timestamp: z.number(),
  text: z.string(),
  parsedCode: z.string().optional(),
});

export type Sms = z.infer<typeof SmsSchema>;

export const SmsListResponseSchema = z.object({
  messages: z.array(SmsSchema),
});

export type SmsListResponse = z.infer<typeof SmsListResponseSchema>;

export const PHONE_NOTES_MAX_LENGTH = 200;

export const UpdatePhoneSchema = z
  .object({ notes: z.string().trim().max(PHONE_NOTES_MAX_LENGTH) })
  .strict();

export type UpdatePhoneInput = z.infer<typeof UpdatePhoneSchema>;

export const PhoneWakeSchema = z.object({
  scheduled: z.boolean(),
  usageWindowStart: z.number().optional(),
  usageWindowEnd: z.number().optional(),
});

export type PhoneWake = z.infer<typeof PhoneWakeSchema>;
