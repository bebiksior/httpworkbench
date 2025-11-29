FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM base AS build
ARG VITE_DOMAIN=localhost
ENV VITE_DOMAIN=${VITE_DOMAIN}
COPY --from=deps /app/node_modules node_modules
COPY . .
WORKDIR /app/packages/frontend
RUN bun run build:skipts

# Caddy Builder Stage
FROM caddy:builder-alpine AS caddy-builder
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare

# Final Stage
FROM caddy:alpine
COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
COPY --from=build /app/packages/frontend/dist /srv/frontend
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
