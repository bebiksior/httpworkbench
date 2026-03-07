import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "packages/frontend": {
      entry: ["index.html"],
      project: ["src/**/*.{ts,vue}"],
    },
    "packages/backend": {
      project: ["src/**/*.ts"],
    },
    "packages/shared": {
      project: ["src/**/*.ts"],
    },
  },
  vue: {
    enabled: true,
  },
  ignore: ["**/*.d.ts"],
  ignoreDependencies: [
    "@types/dompurify",
    "tailwindcss",
    "tailwindcss-primeui",
  ],
};

export default config;
