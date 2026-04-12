import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/storage/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/db.sqlite",
  },
});
