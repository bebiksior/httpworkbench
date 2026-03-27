type CommandOptions = {
  cwd?: string;
  timeoutMs?: number;
};

type CommandResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
};

const defaultTimeoutMs = 30_000;

const runCommandSync = (command: string): CommandResult => {
  const process = Bun.spawnSync({
    cmd: ["/bin/sh", "-lc", command],
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    success: process.exitCode === 0,
    exitCode: process.exitCode,
    stdout: process.stdout.toString().trim(),
    stderr: process.stderr.toString().trim(),
  };
};

export const runCommand = async (
  command: string,
  options: CommandOptions = {},
): Promise<CommandResult> => {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const process = Bun.spawn({
    cmd: ["/bin/sh", "-lc", command],
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeout = setTimeout(() => {
    process.kill();
  }, timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  clearTimeout(timeout);

  return {
    success: exitCode === 0,
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
};

export const commandExists = async (command: string): Promise<boolean> => {
  const result = await runCommand(`command -v ${command}`);
  return result.success;
};

export const getDockerComposeBaseCommand = (): string => {
  const dockerCompose = runCommandSync("docker compose version");
  if (dockerCompose.success) {
    return "docker compose";
  }

  const dockerComposeLegacy = runCommandSync("docker-compose version");
  if (dockerComposeLegacy.success) {
    return "docker-compose";
  }

  return "docker compose";
};

export const tailLines = (value: string, count = 12): string => {
  const lines = value
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "");

  return lines.slice(-count).join("\n");
};
