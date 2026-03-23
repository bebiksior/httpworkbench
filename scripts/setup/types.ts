export type WizardStepId =
  | "preflight"
  | "collect-config"
  | "verify-main-dns"
  | "oauth"
  | "verify-dns-delegation"
  | "start-stack"
  | "verify-http"
  | "verify-dns-service"
  | "done";

export type SetupConfig = {
  domain: string;
  frontendUrl: string;
  serverIp: string;
  jwtSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  cloudflareApiToken: string;
  dnsEnabled: boolean;
  dnsDomain: string;
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
