#!/usr/bin/env bash
# Usage: bash deploy/deploy.sh user@server
# Run from the repo root. Safe to re-run: it rebuilds, uploads, and restarts the service.

set -euo pipefail

SERVER="${1:?Usage: deploy.sh user@server}"

echo "=== Building API ==="
rm -rf /tmp/nfltracker-api
dotnet publish api -c Release -o /tmp/nfltracker-api --nologo -r linux-x64 --self-contained true

echo "=== Building client ==="
(cd web && npm ci && npm run build)

echo "=== Uploading ==="
ssh "$SERVER" "rm -rf ~/nfltracker-upload && mkdir -p ~/nfltracker-upload/api ~/nfltracker-upload/client ~/nfltracker-upload/deploy"
scp -r /tmp/nfltracker-api/. "$SERVER:~/nfltracker-upload/api/"
scp -r web/dist/. "$SERVER:~/nfltracker-upload/client/"
scp deploy/server-install.sh deploy/nfltracker.service deploy/nfl.brianfreestone.com.conf "$SERVER:~/nfltracker-upload/deploy/"

echo "=== Installing on server ==="
ssh -t "$SERVER" "sudo bash ~/nfltracker-upload/deploy/server-install.sh"

echo "=== Done: https://nfl.brianfreestone.com ==="
