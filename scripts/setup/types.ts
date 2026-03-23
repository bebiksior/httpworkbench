export type WizardStepId =
  | "preflight"
  | "collect-config"
  | "verify-dns-records"
  | "oauth"
  | "start-stack"
  | "verify-http"
  | "verify-dns-service"
  | "done";

export type SetupConfig = {
  domain: string;
  frontendUrl: string;
  serverIp: string;
  publicIp: string;
  instancesDomain: string;
  jwtSecret: string;
  caddyAskSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  cloudflareApiToken: string;
  dnsEnabled: boolean;
  dnsPort: number;
  dnsNameservers: string[];
};

export type SetupState = {
  version: 1;
  currentStep: WizardStepId;
  serverIp?: string;
  detectedServerIp?: string;
};

export type CheckResult = {
  label: string;
  ok: boolean;
  details: string;
};

export type VerificationResult = {
  success: boolean;
  items: CheckResult[];
};
