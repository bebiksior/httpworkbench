import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    'packages/frontend': {
      entry: [
        'src/main.ts',
        'vite.config.ts',
        'index.html',
      ],
      project: ['src/**/*.{ts,vue}'],
    },
    'packages/backend': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
    },
    'packages/shared': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
    },
  },
  vue: {
    enabled: true,
  },
  ignore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.d.ts',
    '**/bun.lock',
    '**/package-lock.json',
    '**/pnpm-lock.yaml',
    '**/yarn.lock',
    '**/.git/**',
    'docker-compose.yml',
    '**/Dockerfile',
    'Caddyfile',
    'scripts/**',
    'todo.md',
    'README.md',
    'eslint.config.js',
  ],
  ignoreDependencies: [
    '@types/dompurify',
    'tailwindcss',
    'tailwindcss-primeui',
  ],
};

export default config;
