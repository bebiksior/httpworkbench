import { initServer } from "./server";
import { initDb } from "./storage";

const version = "1.0.0";

async function init() {
  console.log("init", version);

  const result = await initDb();
  if (result.kind === "error") {
    console.error("Failed to initialize database", result.error);
    process.exit(1);
  }

  const { apiServer, instancesServer, stopMaintenance } = initServer();

  console.log("Database initialized", result.stats);

  const shutdown = async () => {
    console.log("Shutting down gracefully...");
    try {
      apiServer.stop();
      instancesServer.stop();
      stopMaintenance();
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

init();
