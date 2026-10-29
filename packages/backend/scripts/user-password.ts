import { UsernameSchema } from "shared";
import { closeDb, initDb, setLocalPassword } from "../src/storage";

const readHiddenLine = (prompt: string) =>
  new Promise<string>((resolve, reject) => {
    let line = "";
    const onData = (data: Buffer) => {
      for (const char of data.toString("utf8")) {
        if (char === "\r" || char === "\n" || char === "\x03") {
          process.stdin.off("data", onData).setRawMode(false).pause();
          process.stdout.write("\n");
          if (char === "\x03") reject(new Error("Cancelled"));
          else resolve(line);
          return;
        }
        if (char === "\x7f") line = line.slice(0, -1);
        else if (char >= " ") line += char;
      }
    };
    process.stdout.write(prompt);
    process.stdin.setRawMode(true).resume().on("data", onData);
  });

const readPassword = async () => {
  if (!process.stdin.isTTY) {
    return (await Bun.stdin.text()).split(/\r?\n/)[0] ?? "";
  }
  const password = await readHiddenLine("Password: ");
  if (password !== (await readHiddenLine("Confirm password: "))) {
    throw new Error("Passwords do not match");
  }
  return password;
};

try {
  const parsed = UsernameSchema.safeParse(Bun.argv[2]);
  if (!parsed.success) {
    throw new Error("Usage: bun run user:password <username>");
  }
  const username = parsed.data;
  const password = await readPassword();
  if (password.length < 12 || password.length > 1024) {
    throw new Error("Password must be 12 to 1024 characters long");
  }
  const initialized = initDb();
  if (initialized.kind === "error") throw initialized.error;
  setLocalPassword(username, await Bun.password.hash(password));
  console.log(`Password set for ${username}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  closeDb();
}
