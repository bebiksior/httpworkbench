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

export const shouldRestartAtCollectConfig = (
  state: SetupState,
  config: Partial<SetupConfig>,
): boolean => {
  return (
    getStepIndex(state.currentStep) > getStepIndex("collect-config") &&
    (config.domain === undefined ||
      config.instancesDomain === undefined ||
      config.publicIp === undefined ||
      config.caddyAskSecret === undefined ||
      config.dnsEnabled !== true ||
      config.googleClientId === undefined ||
      config.googleClientSecret === undefined ||
      config.cloudflareApiToken === undefined)
  );
};

export const getNextWizardStep = (
  step: Exclude<WizardStepId, "done">,
): WizardStepId => {
  switch (step) {
    case "preflight":
      return "collect-config";
    case "collect-config":
      return "verify-main-dns";
    case "verify-main-dns":
      return "oauth";
    case "oauth":
      return "verify-dns-delegation";
    case "verify-dns-delegation":
      return "start-stack";
    case "start-stack":
      return "verify-http";
    case "verify-http":
      return "verify-dns-service";
    case "verify-dns-service":
      return "done";
  }
};

export const getComposeCommand = (): string => {
  return "docker compose -f docker-compose.yml -f docker-compose.dns.yml up -d --build";
};

export const buildFinalChecklist = (config: SetupConfig): string[] => {
  return [
    `- Open ${config.frontendUrl}`,
    `- Create an instance and note its interaction host: <instance>.${config.instancesDomain}`,
    `- Test DNS logging with: dig <instance>.${config.instancesDomain} A`,
    `- Test HTTP logging with: curl https://<instance>.${config.instancesDomain}`,
    `- Start or restart the stack anytime with: ${getComposeCommand()}`,
  ];
};

export const ensureConfig = (
  config: Partial<SetupConfig>,
  currentStep: WizardStepId,
): SetupConfig => {
  const required = [
    config.domain,
    config.frontendUrl,
    config.serverIp,
    config.publicIp,
    config.instancesDomain,
    config.jwtSecret,
    config.caddyAskSecret,
    config.googleClientId,
    config.googleClientSecret,
    config.cloudflareApiToken,
  ];

  const hasRequiredNameservers =
    config.dnsNameservers !== undefined && config.dnsNameservers.length > 0;

  if (
    required.some((value) => value === undefined || value === "") ||
    config.dnsEnabled !== true ||
    config.dnsPort === undefined ||
    !hasRequiredNameservers
  ) {
    throw new Error(
      `Missing saved configuration before ${currentStep}. Please rerun the collect-config step.`,
    );
  }

  return config as SetupConfig;
};
