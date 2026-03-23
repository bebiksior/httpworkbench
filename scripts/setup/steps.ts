import { existsSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildDefaultInstancesAcmeChallengeDomain,
  buildDefaultInstancesDomain,
  buildDefaultNameservers,
  isValidDomain,
  isValidIpv4,
  normalizeDomain,
} from "./config";
import { commandExists, runCommand, tailLines } from "./commands";
import { buildEnvFileContent } from "./env";
import { getComposeCommand, rootDir } from "./flow";
import {
  detectPublicServerIp,
  formatRecords,
  verifyDnsRecords,
  verifyDnsService,
  verifyHttpHealth,
} from "./verification";
import {
  cancelled,
  colorError,
  colorSuccess,
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

export const buildDnsRecordsInstructions = (
  config: SetupConfig,
): string => {
  return [
    "Create these records in Cloudflare:",
    "",
    formatRecords([
      {
        type: "A",
        host: config.domain,
        value: config.serverIp,
      },
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
        host: config.instancesDomain,
        value: config.dnsNameservers[0] ?? "ns1",
      },
      {
        type: "NS",
        host: config.instancesDomain,
        value: config.dnsNameservers[1] ?? "ns2",
      },
    ]),
    "",
    `${config.domain}: Proxied or DNS only`,
    `${config.dnsNameservers[0] ?? "ns1"} and ${config.dnsNameservers[1] ?? "ns2"}: DNS only`,
    `Do not create *.${config.instancesDomain}`,
    `The app DNS server will answer _acme-challenge.${config.instancesDomain} as a CNAME to ${config.instancesAcmeChallengeDomain}.`,
    "Open public ports 53/tcp, 53/udp, 80, and 443 to this VPS.",
  ].join("\n");
};

export const buildStartServicesNote = (): string => {
  return [
    "Run this command to start the stack:",
    "",
    getComposeCommand(),
    "",
    "Keep the DNS compose override in that command so the backend publishes 53/tcp and 53/udp.",
  ].join("\n");
};

export const buildDomainSetupInstructions = (): string => {
  return [
    "Use a domain that is managed in Cloudflare DNS.",
    "",
    "The wizard will set up:",
    "- yourdomain.com for the main app",
    "- instances.yourdomain.com for interaction hosts",
    "- one wildcard certificate for *.instances.yourdomain.com",
  ].join("\n");
};

export const buildCloudflareDomainActivationInstructions = (
  config: Pick<SetupConfig, "domain">,
): string => {
  return [
    "Add the domain to Cloudflare first:",
    "",
    "1. Open the Cloudflare dashboard.",
    `2. Click Add a domain and enter ${config.domain}.`,
    "3. Finish the add-domain flow.",
    "4. Copy the two nameservers Cloudflare gives you.",
    "5. Open your domain registrar.",
    "6. Replace the current nameservers with the two Cloudflare nameservers.",
    "7. Wait until Cloudflare shows the zone as Active.",
    "",
    "Then return here and continue.",
  ].join("\n");
};

export const getSuggestedServerIp = (
  existingConfig: Partial<SetupConfig>,
  state: SetupState | undefined,
): string => {
  return (
    state?.serverIp ?? state?.detectedServerIp ?? existingConfig.serverIp ?? ""
  );
};

export const buildServerIpInstructions = (
  state: SetupState | undefined,
): string | undefined => {
  if (state?.detectedServerIp === undefined || state.detectedServerIp === "") {
    return undefined;
  }

  return [
    "Detected public IPv4:",
    "",
    state.detectedServerIp,
  ].join("\n");
};

export const buildCloudflareTokenInstructions = (
  config: Pick<SetupConfig, "domain">,
): string => {
  return [
    "Create a Cloudflare API token:",
    "",
    "1. Open My Profile -> API Tokens.",
    "2. Click Create Token.",
    "3. Use the Edit zone DNS template.",
    `4. Scope it to ${config.domain}.`,
    "5. Copy the token.",
  ].join("\n");
};

export const buildInteractionDomainInstructions = (
  config: Pick<
    SetupConfig,
    "domain" | "instancesDomain" | "instancesAcmeChallengeDomain"
  >,
): string => {
  return [
    "Interaction zone:",
    "",
    config.instancesDomain,
    "",
    "Example hosts:",
    `- abc.${config.instancesDomain}`,
    `- anything.abc.${config.instancesDomain}`,
    "",
    "TLS:",
    `- One wildcard certificate covers *.${config.instancesDomain}`,
    `- ACME challenge alias: _acme-challenge.${config.instancesDomain} -> ${config.instancesAcmeChallengeDomain}`,
  ].join("\n");
};

export const buildNameserverInstructions = (
  config: Pick<SetupConfig, "dnsNameservers">,
): string => {
  return [
    "Nameservers:",
    "",
    config.dnsNameservers.join(", "),
  ].join("\n");
};

export const buildGoogleOauthClientSetupInstructions = (
  config: Pick<SetupConfig, "frontendUrl">,
): string => {
  return [
    "Create a Google OAuth client:",
    "",
    "1. Open Google Cloud Console -> APIs & Services -> Credentials.",
    "2. Create an OAuth consent screen if Google asks you to.",
    "3. Create an OAuth 2.0 Client ID.",
    "4. Choose Web application.",
    "5. Add this redirect URI:",
    `${config.frontendUrl}/api/auth/google/callback`,
  ].join("\n");
};

export const buildOauthInstructions = (config: SetupConfig): string => {
  return [
    "Add this Google OAuth redirect URI:",
    "",
    `${config.frontendUrl}/api/auth/google/callback`,
  ].join("\n");
};

export const buildHttpVerificationInstructions = (
  config: SetupConfig,
): string => {
  return [
    "Check the main app:",
    "",
    `https://${config.domain}/api/health`,
    "",
    `Instance HTTPS will use the wildcard certificate for *.${config.instancesDomain}.`,
    "First startup provisions the main app certificate and the instances wildcard certificate.",
  ].join("\n");
};

export const buildDnsServiceInstructions = (config: SetupConfig): string => {
  return [
    "Check the DNS service:",
    "",
    `Zone: ${config.instancesDomain}`,
    `Nameservers: ${config.dnsNameservers.join(", ")}`,
    "",
    `dig demo.${config.instancesDomain} A`,
    `dig anything.demo.${config.instancesDomain} TXT`,
    `dig @${config.serverIp} _acme-challenge.${config.instancesDomain} CNAME`,
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

const detectPort53Usage = async (): Promise<string | undefined> => {
  const checks = [
    "ss -ltnup | grep -E '(:53\\s|:53$)'",
    "lsof -nP -iTCP:53 -sTCP:LISTEN -iUDP:53",
  ];

  for (const command of checks) {
    const result = await runCommand(command);
    if (result.stdout !== "") {
      return tailLines(result.stdout, 8);
    }
  }

  return undefined;
};

export const buildPort53CheckResult = (
  port53Usage: string | undefined,
): CheckResult => {
  if (port53Usage === undefined) {
    return {
      label: "Host port 53 is available",
      ok: true,
      details: "Nothing is listening on port 53.",
    };
  }

  return {
    label: "Host port 53 is available",
    ok: false,
    details: [
      "Port 53 is already in use.",
      "Stop the service using it before continuing. Common causes are systemd-resolved, dnsmasq, or bind9.",
      "",
      port53Usage,
    ].join("\n"),
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
  const port53Usage = await detectPort53Usage();
  const port53Check = buildPort53CheckResult(port53Usage);

  progress.stop("Preflight checks complete");

  note(
    [
      renderChecks([...dependencies, port53Check]),
      "",
      `Detected public IPv4: ${detectedServerIp ?? "not detected automatically"}`,
    ].join("\n"),
    "Preflight",
  );

  const missingRequired = [...dependencies, port53Check].filter(
    (item) => !item.ok,
  );
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

const generateSecret = async (label: string): Promise<string> => {
  const progress = spinner();
  progress.start(`Generating ${label}`);
  const result = await runCommand("openssl rand -base64 32");
  if (!result.success || result.stdout === "") {
    progress.stop(`${label} generation failed`);
    throw new Error(result.stderr || `Failed to generate ${label}.`);
  }

  const secret = result.stdout.trim();
  progress.stop(`${label} generated`);
  return secret;
};

export const collectConfig = async (
  existingConfig: Partial<SetupConfig>,
  state: SetupState | undefined,
): Promise<SetupConfig> => {
  note(buildDomainSetupInstructions(), "Domain");

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

  const isManagedInCloudflare = await promptConfirm({
    message: `Is ${domain} already managed in Cloudflare DNS?`,
    initialValue: true,
  });

  if (!isManagedInCloudflare) {
    note(
      buildCloudflareDomainActivationInstructions({ domain }),
      "Cloudflare Domain Setup",
    );

    const confirmed = await promptConfirm({
      message:
        "Have you added the domain to Cloudflare and updated the registrar nameservers?",
      initialValue: false,
    });

    if (!confirmed) {
      cancelled(
        "Setup paused until the domain is active in Cloudflare DNS.",
      );
    }
  }

  const defaultInstancesDomain =
    existingConfig.instancesDomain !== undefined &&
    existingConfig.instancesDomain !== ""
      ? existingConfig.instancesDomain
      : buildDefaultInstancesDomain(domain);
  const defaultNameservers =
    existingConfig.dnsNameservers !== undefined &&
    existingConfig.dnsNameservers.length > 0
      ? existingConfig.dnsNameservers
      : buildDefaultNameservers(domain);
  const defaultInstancesAcmeChallengeDomain =
    existingConfig.instancesAcmeChallengeDomain !== undefined &&
    existingConfig.instancesAcmeChallengeDomain !== ""
      ? existingConfig.instancesAcmeChallengeDomain
      : buildDefaultInstancesAcmeChallengeDomain(domain);

  const serverIpInstructions = buildServerIpInstructions(state);
  if (serverIpInstructions !== undefined) {
    note(serverIpInstructions, "Server IP");
  }

  const serverIp = (
    await promptText({
      message: "What is the public IPv4 of this server?",
      placeholder: "203.0.113.10",
      defaultValue: getSuggestedServerIp(existingConfig, state),
      validate: (value) => {
        if (!isValidIpv4(value)) {
          return "Enter a valid IPv4 address.";
        }
        return undefined;
      },
    })
  ).trim();

  note(
    buildGoogleOauthClientSetupInstructions({
      frontendUrl: `https://${domain}`,
    }),
    "Google OAuth Client",
  );

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

  note(buildCloudflareTokenInstructions({ domain }), "Cloudflare Token");

  const cloudflareApiToken = await promptSecretWithKeep({
    message: "Cloudflare API token with DNS edit access",
    existingValue: existingConfig.cloudflareApiToken,
  });

  note(
    buildInteractionDomainInstructions({
      domain,
      instancesDomain: defaultInstancesDomain,
      instancesAcmeChallengeDomain: defaultInstancesAcmeChallengeDomain,
    }),
    "Interaction Zone",
  );

  const instancesDomain = defaultInstancesDomain;
  const instancesAcmeChallengeDomain = defaultInstancesAcmeChallengeDomain;
  const dnsNameservers = defaultNameservers;

  note(
    buildNameserverInstructions({
      dnsNameservers,
    }),
    "Nameservers",
  );

  const jwtSecret =
    existingConfig.jwtSecret !== undefined && existingConfig.jwtSecret !== ""
      ? existingConfig.jwtSecret
      : await generateSecret("JWT secret");

  const config: SetupConfig = {
    domain,
    frontendUrl: `https://${domain}`,
    serverIp,
    instancesDomain,
    instancesAcmeChallengeDomain,
    jwtSecret,
    googleClientId,
    googleClientSecret,
    cloudflareApiToken,
    dnsEnabled: true,
    dnsPort: 53,
    dnsNameservers,
  };

  note(
    [
      `Domain: ${config.domain}`,
      `Server IP: ${config.serverIp}`,
      `Frontend URL: ${config.frontendUrl}`,
      `Google Client ID: ${config.googleClientId}`,
      `Google Client Secret: ${config.googleClientSecret === "" ? "missing" : "saved"}`,
      `Cloudflare Token: ${config.cloudflareApiToken === "" ? "missing" : "saved"}`,
      `Interaction zone: ${config.instancesDomain}`,
      `Wildcard ACME alias: ${config.instancesAcmeChallengeDomain}`,
      `Nameservers: ${config.dnsNameservers.join(", ")}`,
      "DNS and HTTP logging: enabled",
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

const runVerificationStep = async (params: {
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
          hint: "Run the check",
        },
        {
          value: "skip",
          label: params.continueLabel ?? "Skip this check",
          hint: "Continue for now",
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
      result.success
        ? colorSuccess("Verification passed")
        : colorError("Verification not ready yet"),
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

export const runDnsRecordsVerification = async (
  config: SetupConfig,
): Promise<void> => {
  await runVerificationStep({
    title: "Setup DNS Records",
    instructions: buildDnsRecordsInstructions(config),
    verify: () => verifyDnsRecords(config),
  });
};

export const startStack = async (_config: SetupConfig): Promise<void> => {
  const composeCommand = getComposeCommand();

  note(buildStartServicesNote(), "Start Services");

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
