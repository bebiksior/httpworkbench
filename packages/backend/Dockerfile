FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM base AS release
COPY --from=install /app/node_modules node_modules
COPY --from=install /app/package.json package.json
COPY --from=install /app/packages/backend/package.json packages/backend/
COPY --from=install /app/packages/shared/package.json packages/shared/

COPY packages/backend packages/backend
COPY packages/shared packages/shared

WORKDIR /app/packages/backend
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 8081 8082

CMD ["bun", "run", "src/index.ts"]
