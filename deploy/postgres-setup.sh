#!/usr/bin/env bash
# Creates the nfltracker PostgreSQL database and login on the server and points the app's env file at it.
# Runs ON THE SERVER as root (server-setup.sh calls it). Safe to re-run: does nothing once the env file
# already holds a PostgreSQL connection string. Does not restart the app; the next deploy does that.

set -euo pipefail
cd /tmp

ENV_FILE=/etc/nfltracker/env
DB=nfltracker
ROLE=nfltracker

if grep -q '^ConnectionStrings__Default=Host=' "$ENV_FILE" 2>/dev/null; then
  echo "(already using PostgreSQL, leaving it alone)"
  exit 0
fi

PW="$(openssl rand -hex 24)"

sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$ROLE') THEN
    CREATE ROLE $ROLE LOGIN PASSWORD '$PW';
  ELSE
    ALTER ROLE $ROLE WITH LOGIN PASSWORD '$PW';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB'" | grep -q 1; then
  sudo -u postgres createdb -O "$ROLE" "$DB"
fi

touch "$ENV_FILE"
cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"
sed -i '/^ConnectionStrings__Default=/d' "$ENV_FILE"
echo "ConnectionStrings__Default=Host=localhost;Database=$DB;Username=$ROLE;Password=$PW" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Database '$DB' ready; env file updated. The old SQLite file is left in place as a backup."
