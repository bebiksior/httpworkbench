import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv, type PluginOption } from "vite";

const rootPackageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
);

const updateFontDisplay = (): PluginOption => ({
  name: "update-font-display",
  apply: "build",
  generateBundle(_, bundle) {
    Object.values(bundle).forEach((entry) => {
      if (entry.type !== "asset" || typeof entry.source !== "string") {
        return;
      }
      if (!entry.fileName.endsWith(".css")) {
        return;
      }
      entry.source = entry.source.replace(
        /font-display\s*:\s*block/g,
        "font-display:swap",
      );
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const readBuildEnv = (key: string, fallback = "") =>
    process.env[key] ?? env[key] ?? fallback;

  return {
    build: {
      target: "esnext",
    },
    plugins: [vue(), tailwindcss(), updateFontDisplay()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
      dedupe: [
        "vue",
        "@codemirror/state",
        "@codemirror/view",
        "@codemirror/language",
        "@lezer/highlight",
        "@lezer/common",
      ],
    },
    server: {
      proxy: {
        "/api": {
          target: `http://localhost:${env.API_PORT || "8081"}`,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    define: {
      "import.meta.env.VITE_IS_HOSTED": JSON.stringify(
        readBuildEnv("IS_HOSTED", "false"),
      ),
      "import.meta.env.VITE_ALLOW_GUEST": JSON.stringify(
        readBuildEnv("ALLOW_GUEST", "false"),
      ),
      "import.meta.env.VITE_DNS_ENABLED": JSON.stringify(
        readBuildEnv("DNS_ENABLED", "false"),
      ),
      "import.meta.env.VITE_DOMAIN": JSON.stringify(
        readBuildEnv("DOMAIN", "localhost"),
      ),
      "import.meta.env.VITE_INSTANCES_DOMAIN": JSON.stringify(
        readBuildEnv("INSTANCES_DOMAIN"),
      ),
      __APP_VERSION__: JSON.stringify(rootPackageJson.version),
    },
  };
});
