import * as pc from "picocolors";
import { loadExistingConfig } from "./env";
import {
  createInitialState,
  ensureConfig,
  getStepIndex,
  rootDir,
  stepOrder,
} from "./flow";
import { clearState, loadState, saveState } from "./state";
import {
  collectConfig,
  runDnsDelegationVerification,
  runDnsServiceVerification,
  runHttpVerification,
  runMainDnsVerification,
  runPreflight,
  showOauthInstructions,
  startStack,
} from "./steps";
import { intro, log, outro, promptSelect } from "./ui";
import type { SetupConfig, WizardStepId } from "./types";

const main = async (): Promise<void> => {
  intro(pc.bold("HTTP Workbench Setup Wizard"));

  const existingState = loadState(rootDir);
  let state = existingState ?? createInitialState();

  if (existingState !== undefined && existingState.currentStep !== "done") {
    const action = await promptSelect<"resume" | "restart">({
      message: "A previous setup session was found.",
      options: [
        {
          value: "resume",
          label: "Resume setup",
          hint: `Continue from ${existingState.currentStep}`,
        },
        {
          value: "restart",
          label: "Start over",
          hint: "Discard the saved setup progress and begin again",
        },
      ],
    });

    if (action === "restart") {
      clearState(rootDir);
      state = createInitialState();
    } else {
      log.message(`Resuming from ${existingState.currentStep}.`);
    }
  }

  let config: Partial<SetupConfig> = {
    ...loadExistingConfig(rootDir),
    serverIp: state.serverIp,
  };

  if (
    getStepIndex(state.currentStep) > getStepIndex("collect-config") &&
    (config.domain === undefined ||
      config.googleClientId === undefined ||
      config.googleClientSecret === undefined ||
      config.cloudflareApiToken === undefined)
  ) {
    log.warn(
      "Saved progress exists, but .env is missing required values. Restarting at collect-config.",
    );
    state.currentStep = "collect-config";
  }

  for (const step of stepOrder.slice(getStepIndex(state.currentStep))) {
    if (step === "done") {
      break;
    }

    saveState(rootDir, state);

    switch (step) {
      case "preflight": {
        const preflight = await runPreflight(state);
        state = {
          ...state,
          currentStep: "collect-config",
          detectedServerIp: preflight.detectedServerIp,
        };
        break;
      }
      case "collect-config": {
        config = await collectConfig(config, state);
        state = {
          ...state,
          currentStep: "verify-main-dns",
          serverIp: config.serverIp,
        };
        break;
      }
      case "verify-main-dns": {
        const resolvedConfig = ensureConfig(config, step);
        await runMainDnsVerification(resolvedConfig);
        state = {
          ...state,
          currentStep: "oauth",
        };
        break;
      }
      case "oauth": {
        const resolvedConfig = ensureConfig(config, step);
        await showOauthInstructions(resolvedConfig);
        state = {
          ...state,
          currentStep: resolvedConfig.dnsEnabled
            ? "verify-dns-delegation"
            : "start-stack",
        };
        break;
      }
      case "verify-dns-delegation": {
        const resolvedConfig = ensureConfig(config, step);
        await runDnsDelegationVerification(resolvedConfig);
        state = {
          ...state,
          currentStep: "start-stack",
        };
        break;
      }
      case "start-stack": {
        const resolvedConfig = ensureConfig(config, step);
        await startStack(resolvedConfig);
        state = {
          ...state,
          currentStep: "verify-http",
        };
        break;
      }
      case "verify-http": {
        const resolvedConfig = ensureConfig(config, step);
        await runHttpVerification(resolvedConfig);
        state = {
          ...state,
          currentStep: resolvedConfig.dnsEnabled
            ? "verify-dns-service"
            : "done",
        };
        break;
      }
      case "verify-dns-service": {
        const resolvedConfig = ensureConfig(config, step);
        await runDnsServiceVerification(resolvedConfig);
        state = {
          ...state,
          currentStep: "done",
        };
        break;
      }
    }
  }

  clearState(rootDir);

  const finalConfig = ensureConfig(
    {
      ...loadExistingConfig(rootDir),
      serverIp: state.serverIp,
    },
    "done",
  );
  const composeCommand = finalConfig.dnsEnabled
    ? "docker compose -f docker-compose.yml -f docker-compose.dns.yml up -d --build"
    : "docker compose up -d --build";

  outro(
    [
      "Setup finished.",
      "",
      "Final checklist:",
      `- Open ${finalConfig.frontendUrl}`,
      "- Create an instance and send an HTTP request to its subdomain",
      finalConfig.dnsEnabled
        ? `- Query the DNS hostname shown in the instance details, for example: dig <instance>.${finalConfig.dnsDomain} A`
        : "- Enable DNS logging later by rerunning the wizard and turning it on",
      `- Start or restart the stack anytime with: ${composeCommand}`,
    ].join("\n"),
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
