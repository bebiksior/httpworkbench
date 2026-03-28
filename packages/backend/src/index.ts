import { join } from "node:path";
import { initServer } from "./server";
import { closeDb, initDb, maybeAutoImportLegacyDb } from "./storage";

const rootPackageJson = await Bun.file(
  join(import.meta.dir, "../../../package.json"),
).json();
export const version: string = rootPackageJson.version;

async function init() {
  console.log("init", version);

  const importResult = await maybeAutoImportLegacyDb();
  if (importResult.kind === "imported") {
    console.log(
      "Imported legacy JSON database into SQLite",
      importResult.result,
    );
  }

  const result = initDb();
  if (result.kind === "error") {
    console.error("Failed to initialize database", result.error);
    process.exit(1);
  }

  const { apiServer, instancesServer, stopMaintenance, drainBackgroundWork } =
    initServer();

  console.log("Database initialized", result.stats);

  const shutdown = async () => {
    console.log("Shutting down gracefully...");
    try {
      apiServer.stop();
      instancesServer.stop();
      stopMaintenance();
      await drainBackgroundWork();
      closeDb();
      console.log("Servers stopped");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

init().catch((error) => {
  closeDb();
  console.error("Failed to initialize server", error);
  process.exit(1);
});
