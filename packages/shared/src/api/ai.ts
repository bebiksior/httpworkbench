import { z } from "zod";

export type AiSubscriptionProvider = "chatgpt" | "xai";

export const AiSubscriptionCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().finite(),
  accountId: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  plan: z.string().min(1).optional(),
  isFedRamp: z.boolean().optional(),
});
export type AiSubscriptionCredentials = z.infer<
  typeof AiSubscriptionCredentialsSchema
>;

export const AiDeviceAuthorizationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chatgpt"),
    deviceAuthId: z.string().min(1),
    userCode: z.string().min(1),
    verificationUri: z.url(),
    interval: z.number().positive(),
    expiresAt: z.number().finite(),
  }),
  z.object({
    kind: z.literal("xai"),
    deviceCode: z.string().min(1),
    userCode: z.string().min(1),
    verificationUri: z.url(),
    interval: z.number().positive(),
    expiresAt: z.number().finite(),
  }),
]);
export type AiDeviceAuthorization = z.infer<typeof AiDeviceAuthorizationSchema>;

export type AiDeviceAuthorizationPoll =
  | { kind: "chatgpt"; deviceAuthId: string; userCode: string }
  | { kind: "xai"; deviceCode: string };

export const AiDeviceAuthorizationResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pending"),
    interval: z.number().positive().optional(),
    slowDown: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("connected"),
    credentials: AiSubscriptionCredentialsSchema,
  }),
]);
export type AiDeviceAuthorizationResult = z.infer<
  typeof AiDeviceAuthorizationResultSchema
>;
