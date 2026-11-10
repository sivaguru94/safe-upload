#!/usr/bin/env bash
# Build the site, precompress it and sync it to the OCI host. Usage: scripts/deploy.sh [ssh-host]
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${1:-ubuntu@oci-shinigami.tail338aee.ts.net}"
npm run build
node scripts/render-nginx.mjs
find site/dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.tsv' -o -name '*.wasm' -o -name '*.json' \) -exec gzip -9 -k -f {} \;
ssh "$HOST" 'mkdir -p ~/stacks/reveal/www'
rsync -a --delete site/dist/ "$HOST:stacks/reveal/www/"
rsync -a deploy/compose.yaml deploy/nginx.conf deploy/security-headers.inc "$HOST:stacks/reveal/"
ssh "$HOST" 'cd ~/stacks/reveal && sudo docker compose up -d && sudo docker exec reveal-web nginx -s reload >/dev/null 2>&1 || true'
echo "deployed to $HOST:~/stacks/reveal"
