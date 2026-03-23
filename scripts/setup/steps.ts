import { existsSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildDefaultInstancesDomain,
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
    "Keep your main app domain on Cloudflare, then create these records before continuing:",
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
    ]),
    "",
    `Do not create a wildcard A record for ${config.instancesDomain}. That child zone will be delegated to this server instead.`,
  ].join("\n");
};

export const buildDnsDelegationInstructions = (config: SetupConfig): string => {
  return [
    "Delegate the interaction zone to this server before continuing:",
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
    `After delegation, queries for <instance>.${config.instancesDomain} will bypass Cloudflare and go straight to this VPS.`,
    "Open public UDP and TCP port 53 on the server firewall as part of this step.",
    "Public ports 80 and 443 must also reach this VPS directly so Caddy can issue and renew HTTPS certificates for instance hosts.",
  ].join("\n");
};

export const buildStartServicesNote = (): string => {
  return [
    "The wizard can start the stack for you now.",
    "",
    getComposeCommand(),
    "",
    "This uses the DNS compose override because instance HTTP and DNS traffic share the delegated interaction zone.",
  ].join("\n");
};

export const buildDomainSetupInstructions = (): string => {
  return [
    "Before you begin, make sure the domain you plan to use is managed in Cloudflare DNS.",
    "",
    "HTTP Workbench keeps the main app on your root domain and delegates a child interaction zone to this VPS.",
    "That lets the same hostname log both HTTP and DNS activity, similar to interact.sh.",
    "Later in the setup, the wizard will ask you to create records like:",
    "- yourdomain.com",
    "- ns1.yourdomain.com",
    "- ns2.yourdomain.com",
    "- NS instances.yourdomain.com -> ns1/ns2.yourdomain.com",
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
    "The next prompt is prefilled with the public IPv4 detected during preflight.",
    "",
    `Detected public IPv4: ${state.detectedServerIp}`,
    "",
    "Change it only if this server is behind another public IP, reverse proxy, or load balancer.",
  ].join("\n");
};

export const buildCloudflareTokenInstructions = (
  config: Pick<SetupConfig, "domain">,
): string => {
  return [
    "HTTP Workbench uses a Cloudflare API token so Caddy can request HTTPS certificates for the main app domain through Cloudflare DNS.",
    "",
    "In Cloudflare:",
    "1. Go to My Profile -> API Tokens",
    "2. Click Create Token",
    "3. Use the Edit zone DNS template as the easiest option",
    `4. Scope it to the ${config.domain} zone`,
    "5. Copy the token and paste it into the next prompt",
    "",
    "The main app stays on Cloudflare. Instance subdomains under the delegated interaction zone are issued directly with on-demand TLS by this server.",
  ].join("\n");
};

export const buildInteractionDomainInstructions = (
  config: Pick<SetupConfig, "domain" | "instancesDomain">,
): string => {
  return [
    "HTTP Workbench uses one delegated interaction zone for both HTTP and DNS logging.",
    "",
    "A typical choice is:",
    config.instancesDomain,
    "",
    "Example interaction hostnames:",
    `- abc.${config.instancesDomain}`,
    `- anything.abc.${config.instancesDomain}`,
    "",
    "This child zone must be delegated away from Cloudflare to your VPS so the app can answer DNS queries directly.",
    "The same hostnames also terminate HTTPS directly on this VPS with on-demand certificates.",
  ].join("\n");
};

export const buildGoogleOauthClientSetupInstructions = (
  config: Pick<SetupConfig, "frontendUrl">,
): string => {
  return [
    "HTTP Workbench uses Google OAuth so users can sign in securely without you storing passwords.",
    "",
    "In Google Cloud Console:",
    "1. Go to APIs & Services -> Credentials",
    "2. If prompted, create and configure an OAuth consent screen first",
    "3. Create an OAuth 2.0 Client ID",
    "4. Choose Web application as the application type",
    "5. Add this authorized redirect URI:",
    `${config.frontendUrl}/api/auth/google/callback`,
    "",
    "Then paste the client ID and client secret into the next prompts.",
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
    "The main app should now be reachable over HTTPS.",
    "",
    `Expected health URL: https://${config.domain}/api/health`,
    "",
    `Instance HTTPS is served directly from this VPS at https://<instance>.${config.instancesDomain}.`,
    "The first HTTPS hit to an instance host can take a bit longer while Caddy issues the certificate on demand.",
    "After that, Caddy stores the certificate in its persistent data volume and keeps renewal automatic.",
  ].join("\n");
};

export const buildDnsServiceInstructions = (config: SetupConfig): string => {
  return [
    "The DNS server should now answer authoritatively for the delegated interaction zone.",
    "",
    `Zone: ${config.instancesDomain}`,
    `Nameservers: ${config.dnsNameservers.join(", ")}`,
    `Server IP: ${config.serverIp}`,
    `A answers: ${config.publicIp}`,
    "",
    `Example checks: dig demo.${config.instancesDomain} A`,
    `                dig anything.demo.${config.instancesDomain} TXT`,
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

  note(buildCloudflareTokenInstructions({ domain }), "Cloudflare Token");

  note(
    buildInteractionDomainInstructions({
      domain,
      instancesDomain: defaultInstancesDomain,
    }),
    "Interaction Zone",
  );

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
  const cloudflareApiToken = await promptSecretWithKeep({
    message: "Cloudflare API token with DNS edit access",
    existingValue: existingConfig.cloudflareApiToken,
  });

  const instancesDomain = normalizeDomain(
    await promptText({
      message: "Delegated interaction domain",
      placeholder: "instances.example.com",
      defaultValue: defaultInstancesDomain,
      validate: (value) => {
        if (!isValidDomain(value)) {
          return "Enter a valid delegated interaction domain.";
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

  const jwtSecret =
    existingConfig.jwtSecret !== undefined && existingConfig.jwtSecret !== ""
      ? existingConfig.jwtSecret
      : await generateSecret("JWT secret");
  const caddyAskSecret =
    existingConfig.caddyAskSecret !== undefined &&
    existingConfig.caddyAskSecret !== ""
      ? existingConfig.caddyAskSecret
      : await generateSecret("Caddy ask secret");

  const config: SetupConfig = {
    domain,
    frontendUrl: `https://${domain}`,
    serverIp,
    publicIp: serverIp,
    instancesDomain,
    jwtSecret,
    caddyAskSecret,
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
      `Google Client Secret: ${maskSecret(config.googleClientSecret)}`,
      `Cloudflare Token: ${maskSecret(config.cloudflareApiToken)}`,
      `Interaction zone: ${config.instancesDomain}`,
      `Nameservers: ${config.dnsNameservers.join(", ")}`,
      `DNS and HTTP logging: enabled on the same interaction host`,
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
