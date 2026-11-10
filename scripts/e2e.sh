#!/usr/bin/env bash
# Run the Playwright suite inside Microsoft's image (browsers + system deps included).
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(node -p "require('@playwright/test/package.json').version")
exec docker run --rm --ipc=host --init -u "$(id -u):$(id -g)" -e HOME=/tmp ${BASE_URL:+-e BASE_URL="$BASE_URL"} ${NETWORK:+--network "$NETWORK"} -v "$PWD:/work" -w /work \
  "mcr.microsoft.com/playwright:v${VER}-noble" npx playwright test "$@"
