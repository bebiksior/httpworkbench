import { join } from "node:path";

const readVersion = async (): Promise<string> => {
  try {
    const rootPackageJson = await Bun.file(
      join(import.meta.dir, "../../../package.json"),
    ).json();
    return typeof rootPackageJson.version === "string"
      ? rootPackageJson.version
      : "unknown";
  } catch {
    return "unknown";
  }
};

export const version: string = await readVersion();
