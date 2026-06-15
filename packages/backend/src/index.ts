import { initServer } from "./server";
import { closeDb, initDb, maybeAutoImportLegacyDb } from "./storage";
import { version } from "./version";

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

  const {
    apiServer,
    instancesServer,
    dnsServer,
    stopMaintenance,
    drainBackgroundWork,
  } = await initServer();

  console.log("Database initialized", result.stats);

  const shutdown = async () => {
    console.log("Shutting down gracefully...");
    try {
      apiServer.stop();
      instancesServer.stop();
      await dnsServer?.stop();
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
