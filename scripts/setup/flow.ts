import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { SetupConfig, SetupState, WizardStepId } from "./types";

export const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export const stepOrder: WizardStepId[] = [
  "preflight",
  "collect-config",
  "verify-main-dns",
  "oauth",
  "verify-dns-delegation",
  "start-stack",
  "verify-http",
  "verify-dns-service",
  "done",
];

export const createInitialState = (): SetupState => {
  return {
    version: 1,
    currentStep: "preflight",
  };
};

export const getStepIndex = (step: WizardStepId): number => {
  return stepOrder.indexOf(step);
};

export const ensureConfig = (
  config: Partial<SetupConfig>,
  currentStep: WizardStepId,
): SetupConfig => {
  const required = [
    config.domain,
    config.frontendUrl,
    config.serverIp,
    config.jwtSecret,
    config.googleClientId,
    config.googleClientSecret,
    config.cloudflareApiToken,
    config.dnsDomain,
  ];

  const hasRequiredNameservers =
    config.dnsNameservers !== undefined && config.dnsNameservers.length > 0;

  if (
    required.some((value) => value === undefined || value === "") ||
    config.dnsEnabled === undefined ||
    config.dnsPort === undefined ||
    !hasRequiredNameservers
  ) {
    throw new Error(
      `Missing saved configuration before ${currentStep}. Please rerun the collect-config step.`,
    );
  }

  return config as SetupConfig;
};
