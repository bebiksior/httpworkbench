import * as pc from "picocolors";
import { hasEnvFile, loadExistingConfig } from "./env";
import {
  buildFinalChecklist,
  createInitialState,
  ensureConfig,
  getComposeCommand,
  getNextWizardStep,
  getStepIndex,
  rootDir,
  shouldRestartAtCollectConfig,
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
import type { SetupConfig } from "./types";

const main = async (): Promise<void> => {
  intro(pc.bold("HTTP Workbench Setup Wizard"));

  if (!hasEnvFile(rootDir)) {
    log.message(
      "No .env file was found, so the wizard will start a fresh setup for this server.",
    );
  }

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

  if (shouldRestartAtCollectConfig(state, config)) {
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
          currentStep: getNextWizardStep(step, { dnsEnabled: false }),
          detectedServerIp: preflight.detectedServerIp,
        };
        break;
      }
      case "collect-config": {
        config = await collectConfig(config, state);
        state = {
          ...state,
          currentStep: getNextWizardStep(step, { dnsEnabled: config.dnsEnabled }),
          serverIp: config.serverIp,
        };
        break;
      }
      case "verify-main-dns": {
        const resolvedConfig = ensureConfig(config, step);
        await runMainDnsVerification(resolvedConfig);
        state = {
          ...state,
          currentStep: getNextWizardStep(step, resolvedConfig),
        };
        break;
      }
      case "oauth": {
        const resolvedConfig = ensureConfig(config, step);
        await showOauthInstructions(resolvedConfig);
        state = {
          ...state,
          currentStep: getNextWizardStep(step, resolvedConfig),
        };
        break;
      }
      case "verify-dns-delegation": {
        const resolvedConfig = ensureConfig(config, step);
        await runDnsDelegationVerification(resolvedConfig);
        state = {
          ...state,
          currentStep: getNextWizardStep(step, resolvedConfig),
        };
        break;
      }
      case "start-stack": {
        const resolvedConfig = ensureConfig(config, step);
        await startStack(resolvedConfig);
        state = {
          ...state,
          currentStep: getNextWizardStep(step, resolvedConfig),
        };
        break;
      }
      case "verify-http": {
        const resolvedConfig = ensureConfig(config, step);
        await runHttpVerification(resolvedConfig);
        state = {
          ...state,
          currentStep: getNextWizardStep(step, resolvedConfig),
        };
        break;
      }
      case "verify-dns-service": {
        const resolvedConfig = ensureConfig(config, step);
        await runDnsServiceVerification(resolvedConfig);
        state = {
          ...state,
          currentStep: getNextWizardStep(step, resolvedConfig),
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
  outro(
    [
      "Setup finished.",
      "",
      "Final checklist:",
      ...buildFinalChecklist(finalConfig),
    ].join("\n"),
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
