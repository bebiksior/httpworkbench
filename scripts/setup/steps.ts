import { existsSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildDefaultDnsDomain,
  buildDefaultNameservers,
  formatNameservers,
  isValidDomain,
  isValidIpv4,
  maskSecret,
  normalizeDomain,
  normalizeNameservers,
} from "./config";
import { commandExists, runCommand, tailLines } from "./commands";
import { buildEnvFileContent } from "./env";
import { getComposeCommand, rootDir } from "./flow";
import {
  detectPublicServerIp,
  formatRecords,
  verifyDnsDelegation,
  verifyDnsService,
  verifyHttpHealth,
  verifyMainDnsRecords,
} from "./verification";
import {
  cancelled,
  log,
  note,
  promptConfirm,
  promptPassword,
  promptSelect,
  promptText,
  renderChecks,
  spinner,
} from "./ui";
import type {
  CheckResult,
  SetupConfig,
  SetupState,
  VerificationResult,
} from "./types";

export const buildMainDnsVerificationInstructions = (
  config: SetupConfig,
): string => {
  return [
    "Create these records in Cloudflare before continuing:",
    "",
    formatRecords([
      {
        type: "A",
        host: config.domain,
        value: config.serverIp,
      },
      {
        type: "A",
        host: `*.instances.${config.domain}`,
        value: config.serverIp,
      },
    ]),
  ].join("\n");
};

export const buildDnsDelegationInstructions = (
  config: SetupConfig,
): string => {
  return [
    "DNS logging uses a delegated zone. Add these records before continuing:",
    "",
    formatRecords([
      {
        type: "A",
        host: config.dnsNameservers[0] ?? "ns1",
        value: config.serverIp,
      },
      {
        type: "A",
        host: config.dnsNameservers[1] ?? "ns2",
        value: config.serverIp,
      },
      {
        type: "NS",
        host: config.dnsDomain,
        value: config.dnsNameservers[0] ?? "ns1",
      },
      {
        type: "NS",
        host: config.dnsDomain,
        value: config.dnsNameservers[1] ?? "ns2",
      },
    ]),
    "",
    "Open public UDP and TCP port 53 on the server firewall as part of this step.",
  ].join("\n");
};

export const buildStartServicesNote = (dnsEnabled: boolean): string => {
  return [
    "The wizard can start the stack for you now.",
    "",
    getComposeCommand(dnsEnabled),
    "",
    "This can take a few minutes on a fresh server.",
  ].join("\n");
};

export const buildOauthInstructions = (config: SetupConfig): string => {
  return [
    "Add this Google OAuth redirect URI before you continue:",
    "",
    `${config.frontendUrl}/api/auth/google/callback`,
    "",
    "Once it is saved in Google Cloud Console, continue to the next step.",
  ].join("\n");
};

export const buildHttpVerificationInstructions = (
  config: SetupConfig,
): string => {
  return [
    "The app should now be reachable over HTTPS.",
    "",
    `Expected health URL: https://${config.domain}/api/health`,
  ].join("\n");
};

export const buildDnsServiceInstructions = (
  config: SetupConfig,
): string => {
  return [
    "The DNS server should now answer authoritatively for the delegated zone.",
    "",
    `Zone: ${config.dnsDomain}`,
    `Nameservers: ${config.dnsNameservers.join(", ")}`,
    `Server IP: ${config.serverIp}`,
  ].join("\n");
};

const checkDependency = async (
  label: string,
  check: () => Promise<boolean>,
  installHint: string,
): Promise<CheckResult> => {
  const ok = await check();
  return {
    label,
    ok,
    details: ok ? "Found and ready." : installHint,
  };
};

export const runPreflight = async (
  state: SetupState | undefined,
): Promise<Pick<SetupState, "detectedServerIp">> => {
  const progress = spinner();
  progress.start("Checking server prerequisites");

  const dependencies = await Promise.all([
    checkDependency(
      "Docker",
      () => commandExists("docker"),
      "Install Docker first.",
    ),
    checkDependency(
      "Docker Compose",
      async () => {
        const dockerCompose = await runCommand("docker compose version");
        if (dockerCompose.success) {
          return true;
        }

        const dockerComposeLegacy = await runCommand("docker-compose version");
        return dockerComposeLegacy.success;
      },
      "Install Docker Compose or the Docker Compose plugin.",
    ),
    checkDependency(
      "OpenSSL",
      () => commandExists("openssl"),
      "Install OpenSSL so the wizard can generate a JWT secret.",
    ),
  ]);

  const detectedServerIp =
    state?.detectedServerIp ?? (await detectPublicServerIp());

  progress.stop("Preflight checks complete");

  note(
    [
      renderChecks(dependencies),
      "",
      `Detected public IPv4: ${detectedServerIp ?? "not detected automatically"}`,
    ].join("\n"),
    "Preflight",
  );

  const missingRequired = dependencies.filter((item) => !item.ok);
  if (missingRequired.length > 0) {
    log.error(
      "Required prerequisites are missing. Install them and rerun the wizard.",
    );
    process.exit(1);
  }

  return { detectedServerIp };
};

const promptSecretWithKeep = async (params: {
  message: string;
  existingValue?: string;
}): Promise<string> => {
  return promptPassword({
    message:
      params.existingValue === undefined
        ? params.message
        : `${params.message} (leave blank to keep the saved value)`,
    mask: "*",
    validate: (value) => {
      if (value.trim() !== "" || params.existingValue !== undefined) {
        return undefined;
      }

      return "This value is required.";
    },
  }).then((value) => {
    const trimmed = value.trim();
    return trimmed === "" ? (params.existingValue ?? "") : trimmed;
  });
};

export const collectConfig = async (
  existingConfig: Partial<SetupConfig>,
  state: SetupState | undefined,
): Promise<SetupConfig> => {
  const domain = normalizeDomain(
    await promptText({
      message: "What domain should host HTTP Workbench?",
      placeholder: "example.com",
      defaultValue: existingConfig.domain ?? "",
      validate: (value) => {
        if (!isValidDomain(value)) {
          return "Enter a valid domain name.";
        }
        return undefined;
      },
    }),
  );

  const defaultDnsDomain =
    existingConfig.dnsDomain !== undefined && existingConfig.dnsDomain !== ""
      ? existingConfig.dnsDomain
      : buildDefaultDnsDomain(domain);
  const defaultNameservers =
    existingConfig.dnsNameservers !== undefined &&
    existingConfig.dnsNameservers.length > 0
      ? existingConfig.dnsNameservers
      : buildDefaultNameservers(domain);

  const serverIp = (
    await promptText({
      message: "What is the public IPv4 of this server?",
      placeholder: "203.0.113.10",
      defaultValue:
        state?.serverIp ??
        state?.detectedServerIp ??
        existingConfig.serverIp ??
        "",
      validate: (value) => {
        if (!isValidIpv4(value)) {
          return "Enter a valid IPv4 address.";
        }
        return undefined;
      },
    })
  ).trim();

  const googleClientId = (
    await promptText({
      message: "Google OAuth client ID",
      placeholder:
        existingConfig.googleClientId === undefined
          ? "your-google-client-id"
          : "Press enter to keep the saved value",
      defaultValue: existingConfig.googleClientId,
      validate: (value) => {
        if (value.trim() === "") {
          return "Google OAuth client ID is required.";
        }
        return undefined;
      },
    })
  ).trim();

  const googleClientSecret = await promptSecretWithKeep({
    message: "Google OAuth client secret",
    existingValue: existingConfig.googleClientSecret,
  });
  const cloudflareApiToken = await promptSecretWithKeep({
    message: "Cloudflare API token with DNS edit access",
    existingValue: existingConfig.cloudflareApiToken,
  });
  const dnsEnabled = await promptConfirm({
    message: "Enable DNS query logging support?",
    initialValue: existingConfig.dnsEnabled ?? false,
  });

  const dnsDomain = normalizeDomain(
    await promptText({
      message: "Delegated DNS zone",
      placeholder: "dns.example.com",
      defaultValue: defaultDnsDomain,
      validate: (value) => {
        if (!isValidDomain(value)) {
          return "Enter a valid delegated DNS zone.";
        }
        return undefined;
      },
    }),
  );

  const dnsNameservers = normalizeNameservers(
    await promptText({
      message: "Authoritative nameservers",
      placeholder: "ns1.example.com,ns2.example.com",
      defaultValue: formatNameservers(defaultNameservers),
      validate: (value) => {
        const parsed = normalizeNameservers(value);
        if (
          parsed.length < 2 ||
          parsed.some((entry) => !isValidDomain(entry))
        ) {
          return "Enter at least two valid hostnames separated by commas.";
        }
        return undefined;
      },
    }),
  );

  let jwtSecret = existingConfig.jwtSecret;
  if (jwtSecret === undefined || jwtSecret === "") {
    const progress = spinner();
    progress.start("Generating a JWT secret");
    const result = await runCommand("openssl rand -base64 32");
    if (!result.success || result.stdout === "") {
      progress.stop("JWT secret generation failed");
      throw new Error(result.stderr || "Failed to generate JWT secret.");
    }
    jwtSecret = result.stdout.trim();
    progress.stop("JWT secret generated");
  }

  const config: SetupConfig = {
    domain,
    frontendUrl: `https://${domain}`,
    serverIp,
    jwtSecret,
    googleClientId,
    googleClientSecret,
    cloudflareApiToken,
    dnsEnabled,
    dnsDomain,
    dnsPort: 53,
    dnsNameservers,
  };

  note(
    [
      `Domain: ${config.domain}`,
      `Server IP: ${config.serverIp}`,
      `Frontend URL: ${config.frontendUrl}`,
      `Google Client ID: ${config.googleClientId}`,
      `Google Client Secret: ${maskSecret(config.googleClientSecret)}`,
      `Cloudflare Token: ${maskSecret(config.cloudflareApiToken)}`,
      `DNS logging: ${config.dnsEnabled ? "enabled" : "disabled"}`,
      `Delegated DNS zone: ${config.dnsDomain}`,
      `Nameservers: ${config.dnsNameservers.join(", ")}`,
    ].join("\n"),
    "Configuration Summary",
  );

  const envPath = path.join(rootDir, ".env");
  const confirmed = await promptConfirm({
    message: existsSync(envPath)
      ? "Overwrite the existing .env with this configuration?"
      : "Write this configuration to .env?",
    initialValue: true,
  });

  if (!confirmed) {
    cancelled("Setup paused before writing .env.");
  }

  writeFileSync(envPath, buildEnvFileContent(config));
  log.success(`Saved configuration to ${envPath}`);

  return config;
};

export const runVerificationStep = async (params: {
  title: string;
  instructions: string;
  verify: () => Promise<VerificationResult>;
  continueLabel?: string;
}): Promise<void> => {
  note(params.instructions, params.title);

  while (true) {
    const action = await promptSelect<"check" | "skip">({
      message: "What should the wizard do next?",
      options: [
        {
          value: "check",
          label: "Check now",
          hint: "Run automated verification for this step",
        },
        {
          value: "skip",
          label: params.continueLabel ?? "Continue without verification",
          hint: "Keep moving and verify later",
        },
      ],
    });

    if (action === "skip") {
      log.warn("Continuing without automated verification for this step.");
      return;
    }

    const progress = spinner();
    progress.start("Verifying");
    const result = await params.verify();
    progress.stop(
      result.success ? "Verification passed" : "Verification not ready yet",
    );

    note(
      renderChecks(result.items),
      result.success ? `${params.title} Verified` : `${params.title} Pending`,
    );

    if (result.success) {
      return;
    }
  }
};

export const runMainDnsVerification = async (
  config: SetupConfig,
): Promise<void> => {
  await runVerificationStep({
    title: "Main DNS Records",
    instructions: buildMainDnsVerificationInstructions(config),
    verify: () => verifyMainDnsRecords(config),
  });
};

export const runDnsDelegationVerification = async (
  config: SetupConfig,
): Promise<void> => {
  await runVerificationStep({
    title: "DNS Delegation",
    instructions: buildDnsDelegationInstructions(config),
    verify: () => verifyDnsDelegation(config),
  });
};

export const startStack = async (config: SetupConfig): Promise<void> => {
  const composeCommand = getComposeCommand(config.dnsEnabled);

  note(buildStartServicesNote(config.dnsEnabled), "Start Services");

  while (true) {
    const action = await promptSelect<"start" | "skip">({
      message: "How should we proceed?",
      options: [
        {
          value: "start",
          label: "Start the stack now",
          hint: "Run docker compose and build the images",
        },
        {
          value: "skip",
          label: "Skip starting for now",
          hint: "You can run the compose command manually later",
        },
      ],
    });

    if (action === "skip") {
      log.warn("Skipping docker compose start for now.");
      return;
    }

    const progress = spinner();
    progress.start("Building and starting containers");

    const result = await runCommand(composeCommand, {
      cwd: rootDir,
      timeoutMs: 20 * 60_000,
    });

    if (result.success) {
      progress.stop("Containers started");
      log.success("Docker Compose finished successfully.");
      return;
    }

    progress.stop("Docker Compose failed");
    note(
      tailLines(
        [result.stdout, result.stderr].filter(Boolean).join("\n"),
        20,
      ) || "No output captured.",
      "Docker Compose Output",
    );

    const retry = await promptConfirm({
      message: "Docker Compose failed. Retry the start step?",
      initialValue: true,
    });

    if (!retry) {
      return;
    }
  }
};

export const showOauthInstructions = async (
  config: SetupConfig,
): Promise<void> => {
  note(buildOauthInstructions(config), "Google OAuth");

  const confirmed = await promptConfirm({
    message: "Have you added the Google OAuth redirect URI?",
    initialValue: true,
  });

  if (!confirmed) {
    cancelled("Setup paused while waiting for the Google OAuth redirect URI.");
  }
};

export const runHttpVerification = async (
  config: SetupConfig,
): Promise<void> => {
  await runVerificationStep({
    title: "HTTP Health",
    instructions: buildHttpVerificationInstructions(config),
    verify: () => verifyHttpHealth(config),
  });
};

export const runDnsServiceVerification = async (
  config: SetupConfig,
): Promise<void> => {
  await runVerificationStep({
    title: "DNS Service",
    instructions: buildDnsServiceInstructions(config),
    verify: () => verifyDnsService(config),
  });
};
