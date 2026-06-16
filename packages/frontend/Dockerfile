FROM oven/bun:1.3.10 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM base AS build
ARG DOMAIN=localhost
ARG INSTANCES_DOMAIN=
ARG IS_HOSTED=false
ARG ALLOW_GUEST=false
ARG DNS_ENABLED=false
ARG SMTP_ENABLED=false
ENV DOMAIN=${DOMAIN}
ENV INSTANCES_DOMAIN=${INSTANCES_DOMAIN}
ENV IS_HOSTED=${IS_HOSTED}
ENV ALLOW_GUEST=${ALLOW_GUEST}
ENV DNS_ENABLED=${DNS_ENABLED}
ENV SMTP_ENABLED=${SMTP_ENABLED}
COPY --from=deps /app /app
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
