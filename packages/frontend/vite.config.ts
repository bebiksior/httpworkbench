import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
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
      "import.meta.env.VITE_DOMAIN": JSON.stringify(
        process.env.DOMAIN || env.DOMAIN || "localhost",
      ),
    },
  };
});
