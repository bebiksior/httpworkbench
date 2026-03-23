#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

run_with_bun() {
    if [ ! -d "node_modules" ]; then
        echo "Installing setup dependencies with Bun..."
        bun install --frozen-lockfile
    fi

    exec bun run ./scripts/setup/index.ts "$@"
}

if command -v bun >/dev/null 2>&1; then
    run_with_bun "$@"
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "Bun is not installed and Docker is unavailable for the fallback runner."
    echo "Install Bun from https://bun.sh or Docker from https://docs.docker.com/get-docker/."
    exit 1
fi

echo "Bun was not found locally, so the setup wizard will run inside an ephemeral Bun container."
echo "This may take a moment on the first run."

exec docker run --rm -it \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -v "$ROOT_DIR":/workspace \
    -w /workspace \
    oven/bun:1 \
    sh -lc 'bun install --frozen-lockfile && bun run ./scripts/setup/index.ts'
