#!/usr/bin/env bash
# Usage (from the repo root, in Git Bash): bash deploy/first-time-setup.sh brian@10.0.0.94
set -euo pipefail
SERVER="${1:?Usage: first-time-setup.sh user@server}"
ssh "$SERVER" "rm -rf ~/nfltracker-setup && mkdir -p ~/nfltracker-setup"
scp deploy/server-setup.sh deploy/postgres-setup.sh deploy/nfltracker.service deploy/nfl.brianfreestone.com.conf "$SERVER:~/nfltracker-setup/"
ssh -t "$SERVER" "sudo bash ~/nfltracker-setup/server-setup.sh"
